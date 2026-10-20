import { ClaudeError, FirstStepResult, firstStepRequest, matchShortcutId } from "@shared/claude";
import { keepSentSources, type ShapeInput } from "@shared/shape";
import type { FirstStepState } from "@shared/firstStep";
import type { AppData } from "@shared/types";
import { localDate } from "@shared/todos";
import { runClaude } from "./claude/client";

// 할 일마다 첫 행동 요청 상태를 들고, 바뀔 때마다 모든 창에 알린다.
export class FirstStepManager {
  private states = new Map<string, FirstStepState>();
  private aborts = new Map<string, AbortController>();
  // 최근에 걸린 시간(ms). 기다리는 동안 “보통 몇 초”를 실제 기록으로 보여 준다.
  private durations: number[] = [];
  // Claude가 없거나 로그인이 안 됐으면 이번 실행 동안은 미리 찾지 않는다(헛된 호출을 반복하지 않게).
  private prefetchOff = false;

  constructor(
    private getData: () => AppData,
    private onChange: (all: FirstStepState[]) => void,
  ) {}

  all(): FirstStepState[] {
    return [...this.states.values()];
  }

  private expectMs(): number | null {
    if (!this.durations.length) return null;
    const s = [...this.durations].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  }

  // 뒤에서 미리 찾는다. 이미 상태가 있으면(찾는 중·찾아 둠·보이는 중) 건드리지 않는다.
  prefetch(todoId: string): void {
    if (this.prefetchOff || this.states.has(todoId)) return;
    void this.request(todoId, {}, true);
  }

  private set(todoId: string, patch: Partial<FirstStepState>): void {
    const prev = this.states.get(todoId);
    if (!prev) return;
    this.states.set(todoId, { ...prev, ...patch });
    this.onChange(this.all());
  }

  // answer가 있으면 질문에 답한 것, again이면 "다른 제안"이다. shape가 있으면 C1에서 고른 값으로 빚는다.
  async request(todoId: string, opts: { answer?: string; again?: boolean; shape?: ShapeInput } = {}, hidden = false): Promise<void> {
    const data = this.getData();
    const todo = data.todos.find((t) => t.id === todoId);
    if (!todo) return;
    const prev = this.states.get(todoId);
    // 미리 찾아 둔(또는 찾는 중인) 것을 그대로 보여 준다. 제목이 그대로일 때만.
    if (!hidden && prev?.hidden && !opts.answer && !opts.again && !opts.shape) {
      if (prev.forTitle === todo.title && prev.status !== "error") return this.set(todoId, { hidden: false });
    }
    const previous = [...(prev?.previous ?? [])];
    if (opts.again && prev?.title) previous.push(prev.title);
    const answer = opts.answer?.trim() || (opts.again ? prev?.answer : null) || null;
    // 다시 빚거나 질문에 답할 때는 앞에서 고른 값을 그대로 쓴다.
    const shape = opts.shape ?? prev?.shape ?? null;

    this.aborts.get(todoId)?.abort();
    const abort = new AbortController();
    this.aborts.set(todoId, abort);
    this.states.set(todoId, {
      todoId,
      status: "loading",
      title: null,
      shortcutId: null,
      question: null,
      answer,
      previous,
      error: null,
      shape,
      minutes: null,
      sources: [],
      hidden,
      forTitle: todo.title,
      startedAt: Date.now(),
      expectMs: this.expectMs(),
    });
    this.onChange(this.all());
    const started = Date.now();

    try {
      const body = firstStepRequest({ title: todo.title, rawText: todo.rawText, answer, previous, shape, dueDate: todo.dueDate }, localDate(), data.shortcuts);
      const r = await runClaude(body, FirstStepResult, {
        configuredPath: data.settings.claudePath,
        model: data.settings.model,
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      this.durations = [...this.durations, Date.now() - started].slice(-5);
      if (r.title)
        this.set(todoId, {
          status: "suggestion",
          title: r.title,
          shortcutId: matchShortcutId(r.shortcut ?? null, data.shortcuts),
          minutes: shape ? (r.minutes ?? shape.minutes) : null,
          sources: shape ? keepSentSources(r.sources ?? [], shape.context.map((c) => c.source)) : [],
        });
      else this.set(todoId, { status: "question", question: r.question });
    } catch (e) {
      if (abort.signal.aborted) return;
      const err = e instanceof ClaudeError ? e : new ClaudeError("failed", String(e));
      // 미리 찾다가 실패하면 조용히 버린다. 물어볼 때 다시 찾는다.
      if (this.states.get(todoId)?.hidden) {
        if (err.kind === "notFound" || err.kind === "notLoggedIn") this.prefetchOff = true;
        this.states.delete(todoId);
        this.onChange(this.all());
        return;
      }
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
