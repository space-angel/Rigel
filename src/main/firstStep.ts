import { ClaudeError, FirstStepResult, firstStepRequest, matchShortcutId } from "@shared/claude";
import type { FirstStepState } from "@shared/firstStep";
import type { AppData } from "@shared/types";
import { localDate } from "@shared/todos";
import { runClaude } from "./claude/client";

// 할 일마다 첫 행동 요청 상태를 들고, 바뀔 때마다 모든 창에 알린다.
export class FirstStepManager {
  private states = new Map<string, FirstStepState>();
  private aborts = new Map<string, AbortController>();

  constructor(
    private getData: () => AppData,
    private onChange: (all: FirstStepState[]) => void,
  ) {}

  all(): FirstStepState[] {
    return [...this.states.values()];
  }

  private set(todoId: string, patch: Partial<FirstStepState>): void {
    const prev = this.states.get(todoId);
    if (!prev) return;
    this.states.set(todoId, { ...prev, ...patch });
    this.onChange(this.all());
  }

  // answer가 있으면 질문에 답한 것, again이면 "다른 제안"이다.
  async request(todoId: string, opts: { answer?: string; again?: boolean } = {}): Promise<void> {
    const data = this.getData();
    const todo = data.todos.find((t) => t.id === todoId);
    if (!todo) return;
    const prev = this.states.get(todoId);
    const previous = [...(prev?.previous ?? [])];
    if (opts.again && prev?.title) previous.push(prev.title);
    const answer = opts.answer?.trim() || (opts.again ? prev?.answer : null) || null;

    this.aborts.get(todoId)?.abort();
    const abort = new AbortController();
    this.aborts.set(todoId, abort);
    this.states.set(todoId, { todoId, status: "loading", title: null, shortcutId: null, question: null, answer, previous, error: null });
    this.onChange(this.all());

    try {
      const body = firstStepRequest({ title: todo.title, rawText: todo.rawText, answer, previous }, localDate(), data.shortcuts);
      const r = await runClaude(body, FirstStepResult, {
        configuredPath: data.settings.claudePath,
        model: data.settings.model,
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (r.title) this.set(todoId, { status: "suggestion", title: r.title, shortcutId: matchShortcutId(r.shortcut ?? null, data.shortcuts) });
      else this.set(todoId, { status: "question", question: r.question });
    } catch (e) {
      if (abort.signal.aborted) return;
      const err = e instanceof ClaudeError ? e : new ClaudeError("failed", String(e));
      this.set(todoId, { status: "error", error: { kind: err.kind, message: err.message } });
    }
  }

  dismiss(todoId: string): void {
    this.aborts.get(todoId)?.abort();
    this.aborts.delete(todoId);
    this.states.delete(todoId);
    this.onChange(this.all());
  }
}
