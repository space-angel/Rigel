import { z } from "zod";
import { DateString, type Shortcut } from "./types.ts";

// claude -p 로 보내는 요청 본문과 받은 결과를 다룬다. 실행은 메인 프로세스(src/main/claude)가 한다.

export const SplitTask = z.object({
  title: z.string().min(1),
  plannedDate: DateString.nullable(),
  isClear: z.boolean(),
  shortcut: z.string().nullable(),
});
export type SplitTask = z.infer<typeof SplitTask>;

export const SplitResult = z.object({ tasks: z.array(SplitTask).min(1) });
export type SplitResult = z.infer<typeof SplitResult>;

// 바로가기는 이름과 부르는 말만 보낸다. 링크는 보내지 않는다.
export function shortcutHints(shortcuts: Shortcut[]) {
  return shortcuts.map((s) => ({ name: s.name, keywords: s.keywords }));
}

export function splitRequest(text: string, today: string, shortcuts: Shortcut[]): string {
  return JSON.stringify({ type: "split", today, text, shortcuts: shortcutHints(shortcuts) });
}

export type ClaudeErrorKind = "notFound" | "notLoggedIn" | "timeout" | "parseFailed" | "failed";

export class ClaudeError extends Error {
  kind: ClaudeErrorKind;
  constructor(kind: ClaudeErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

const LOGIN_HINT = /log ?in|logged out|authenticat|invalid api key|oauth|\/login|credential/i;

// CLI가 돌려준 JSON 하나에서 result 문자열을 꺼내, 앞뒤 코드 블록 표시를 지운 뒤 다시 JSON으로 파싱한다.
export function parseClaudeOutput<T>(stdout: string, stderr: string, schema: z.ZodType<T>): T {
  let outer: { result?: unknown; is_error?: boolean };
  try {
    outer = JSON.parse(stdout);
  } catch {
    if (LOGIN_HINT.test(stderr) || LOGIN_HINT.test(stdout)) throw new ClaudeError("notLoggedIn", stderr || stdout);
    throw new ClaudeError("failed", (stderr || stdout).slice(0, 500) || "claude가 아무것도 돌려주지 않았어요");
  }
  const result = String(outer.result ?? "");
  if (outer.is_error) {
    if (LOGIN_HINT.test(result) || LOGIN_HINT.test(stderr)) throw new ClaudeError("notLoggedIn", result);
    throw new ClaudeError("failed", result.slice(0, 500));
  }
  const cleaned = result
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return schema.parse(JSON.parse(cleaned));
  } catch {
    throw new ClaudeError("parseFailed", result.slice(0, 500));
  }
}

// AI가 돌려준 바로가기 이름이 목록에 없으면 연결하지 않는다.
export function matchShortcutId(name: string | null, shortcuts: Shortcut[]): string | null {
  if (!name) return null;
  return shortcuts.find((s) => s.name === name)?.id ?? null;
}

export const FirstStepResult = z
  .object({
    title: z.string().min(1).nullable(),
    question: z.string().min(1).nullable(),
    shortcut: z.string().nullable().optional(),
  })
  .refine((r) => r.title !== null || r.question !== null, "title이나 question 중 하나는 있어야 해요");
export type FirstStepResult = z.infer<typeof FirstStepResult>;

export interface FirstStepInput {
  title: string;
  rawText: string;
  answer: string | null;
  previous: string[]; // 이미 제안했던 첫 행동. "다른 제안"을 눌렀을 때 같은 걸 다시 내지 않게 한다.
}

export function firstStepRequest(input: FirstStepInput, today: string, shortcuts: Shortcut[]): string {
  return JSON.stringify({
    type: "firstStep",
    today,
    title: input.title,
    rawText: input.rawText,
    answer: input.answer,
    previous: input.previous,
    shortcuts: shortcutHints(shortcuts),
  });
}
