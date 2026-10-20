import { app } from "electron";
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ClaudeError, SplitResult, matchShortcutId, splitRequest } from "@shared/claude";
import { firstLine } from "@shared/quickInput";
import type { ReviewDraft, ReviewState } from "@shared/review";
import type { AppData } from "@shared/types";
import { localDate } from "@shared/todos";
import { runClaude } from "./claude/client";
import { collectManyMcp } from "./tools/mcp";
import { MCP_SOURCES, mentionedServices } from "@shared/mcp";

// 빠른 입력 원문은 claude를 부르기 전에 먼저 저장한다. 넣기나 취소 전까지 남겨 두고,
// 그 사이 앱이 꺼지면 다음 실행 때 확인 창을 다시 연다.
const pendingPath = () => join(app.getPath("userData"), "pending.json");

export function savePending(rawText: string): void {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(pendingPath(), JSON.stringify({ rawText, savedAt: new Date().toISOString() }));
}

export function loadPending(): string | null {
  try {
    return existsSync(pendingPath()) ? (JSON.parse(readFileSync(pendingPath(), "utf8")).rawText as string) : null;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  rmSync(pendingPath(), { force: true });
}

export function fallbackDraft(rawText: string): ReviewDraft {
  return { key: randomUUID(), title: firstLine(rawText), plannedDate: localDate(), isClear: false, shortcutId: null };
}

export class ReviewSession {
  state: ReviewState;
  private abort: AbortController | null = null;

  constructor(
    rawText: string,
    private getData: () => AppData,
    private onChange: (s: ReviewState) => void,
  ) {
    this.state = { sessionId: randomUUID(), rawText, status: "loading", startedAt: Date.now(), drafts: [], error: null, context: {}, enrich: {}, mentions: [] };
  }

  private set(patch: Partial<ReviewState>): void {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  async split(): Promise<void> {
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.set({ status: "loading", startedAt: Date.now(), error: null, drafts: [], context: {}, enrich: {}, mentions: [] });
    const data = this.getData();
    try {
      const result = await runClaude(splitRequest(this.state.rawText, localDate(), data.shortcuts), SplitResult, {
        configuredPath: data.settings.claudePath,
        model: data.settings.model,
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      const drafts = result.tasks.map((t) => ({
        key: randomUUID(),
        title: t.title,
        plannedDate: t.plannedDate,
        dueDate: t.dueDate,
        isClear: t.isClear,
        shortcutId: matchShortcutId(t.shortcut, data.shortcuts),
      }));
      this.set({ status: "ready", drafts });
      this.enrich(abort);
    } catch (e) {
      if (abort.signal.aborted) return;
      const err = e instanceof ClaudeError ? e : new ClaudeError("failed", String(e));
      // 결과를 읽지 못했으면 원문 첫 줄을 제목으로 한 정리 안 된 할 일 하나를 넣어 둔다.
      if (err.kind === "parseFailed") this.set({ status: "ready", drafts: [fallbackDraft(this.state.rawText)], error: { kind: err.kind, message: err.message } });
      else this.set({ status: "error", error: { kind: err.kind, message: err.message } });
    }
  }

  // 켜 둔 MCP 도구마다 한 번씩, 나눈 할 일 전부에 맞는 자료를 찾는다. 결과가 오는 대로 칩을 채운다.
  private enrich(abort: AbortController): void {
    const data = this.getData();
    const on = MCP_SOURCES.filter((s) => data.settings.tools.mcp[s]);
    const mentions = mentionedServices(this.state.rawText).filter((s) => !on.includes(s));
    this.set({ enrich: Object.fromEntries(on.map((s) => [s, "loading"])), mentions });
    for (const source of on) {
      collectManyMcp(source, this.state.drafts, data, abort.signal).then((r) => {
        if (abort.signal.aborted) return;
        const context = { ...this.state.context };
        for (const [key, note] of Object.entries(r.notes)) context[key] = [...(context[key] ?? []), note];
        this.set({ context, enrich: { ...this.state.enrich, [source]: r.status } });
      });
    }
  }

  cancel(): void {
    this.abort?.abort();
  }
}
