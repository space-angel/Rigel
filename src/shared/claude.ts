import { z } from "zod";
import type { ShapeInput } from "./shape.ts";
import { DateString, type Shortcut } from "./types.ts";

// claude -p 로 보내는 요청 본문과 받은 결과를 다룬다. 실행은 메인 프로세스(src/main/claude)가 한다.

export const SplitTask = z.object({
  title: z.string().min(1),
  plannedDate: DateString.nullable(),
  // 마감·행사 날. 예전 규칙 파일이나 모델이 빼먹어도 읽히도록 없으면 null.
  dueDate: DateString.nullable().optional().transform((v) => v ?? null),
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

// usageLimit: 구독 사용량 한도(또는 API 크레딧 부족). network: 인터넷이나 Anthropic 서버에 닿지 못함.
// outdated: 앱이 쓰는 옵션을 모르는 옛 claude(업데이트하면 풀린다).
export type ClaudeErrorKind = "notFound" | "notLoggedIn" | "usageLimit" | "network" | "outdated" | "timeout" | "parseFailed" | "failed";

export class ClaudeError extends Error {
  kind: ClaudeErrorKind;
  constructor(kind: ClaudeErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

const LOGIN_HINT = /log ?in|logged out|authenticat|invalid api key|oauth|\/login|credential/i;
// 다른 사람이 처음 쓸 때 자주 만나는 실패. 실제 CLI 문구(docs/qa/fixtures/claude-outputs)에 맞춘다.
const LIMIT_HINT = /usage limit|limit reached|hit your limit|rate.?limit|too many requests|\b429\b|credit balance|quota/i;
const OUTDATED_HINT = /unknown option|unrecognized option|unknown argument|invalid option/i;
const NETWORK_HINT = /connection error|network|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|getaddrinfo|socket hang up/i;

// 한도 문구에서 다시 쓸 수 있는 때를 꺼낸다: "resets 3pm", "resets 7pm (Asia/Seoul)", "…|1760000000"(유닉스 초)
export function limitReset(message: string, now = new Date()): string | null {
  const epoch = message.match(/\|(\d{10})\b/);
  if (epoch) {
    const d = new Date(Number(epoch[1]) * 1000);
    if (d > now) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const at = message.match(/resets?\s+(?:at\s+)?([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)?)/i);
  return at ? at[1]!.replace(/\s+/g, "").toLowerCase() : null;
}

// 실패 문구를 종류로 나눈다. 로그인 문구가 한도·네트워크 문구와 같이 오면 로그인을 먼저 본다(다시 로그인하면 풀린다).
export function classifyFailure(text: string): ClaudeErrorKind {
  if (OUTDATED_HINT.test(text)) return "outdated";
  if (LOGIN_HINT.test(text)) return "notLoggedIn";
  if (LIMIT_HINT.test(text)) return "usageLimit";
  if (NETWORK_HINT.test(text)) return "network";
  return "failed";
}

// CLI가 돌려준 JSON 하나에서 result 문자열을 꺼내, 앞뒤 코드 블록 표시를 지운 뒤 다시 JSON으로 파싱한다.
export function parseClaudeOutput<T>(stdout: string, stderr: string, schema: z.ZodType<T>): T {
  let outer: { result?: unknown; is_error?: boolean };
  try {
    outer = JSON.parse(stdout);
  } catch {
    const text = `${stderr}\n${stdout}`;
    throw new ClaudeError(classifyFailure(text), (stderr || stdout).slice(0, 500) || "claude가 아무것도 돌려주지 않았어요");
  }
  const result = String(outer.result ?? "");
  if (outer.is_error) throw new ClaudeError(classifyFailure(`${result}\n${stderr}`), result.slice(0, 500));
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

export const FirstStepSource = z.object({ source: z.string(), label: z.string(), weight: z.number() });
export type FirstStepSource = z.infer<typeof FirstStepSource>;

export const FirstStepResult = z
  .object({
    title: z.string().min(1).nullable(),
    question: z.string().min(1).nullable(),
    shortcut: z.string().nullable().optional(),
    // 빚기(C1)로 요청했을 때만 온다.
    minutes: z.number().nullable().optional(),
    sources: z.array(FirstStepSource).optional(),
  })
  .refine((r) => r.title !== null || r.question !== null, "title이나 question 중 하나는 있어야 해요");
export type FirstStepResult = z.infer<typeof FirstStepResult>;

export interface FirstStepInput {
  title: string;
  rawText: string;
  answer: string | null;
  previous: string[]; // 이미 제안했던 첫 행동. "다른 제안"을 눌렀을 때 같은 걸 다시 내지 않게 한다.
  shape?: ShapeInput | null; // C1에서 고른 낱말, 크기, 자료
  dueDate?: string | null; // 마감. 그 전에 끝낼 수 있는 첫 행동을 고르게 한다
}

export function firstStepRequest(input: FirstStepInput, today: string, shortcuts: Shortcut[]): string {
  return JSON.stringify({
    type: "firstStep",
    today,
    title: input.title,
    rawText: input.rawText,
    answer: input.answer,
    previous: input.previous,
    ...(input.dueDate && { dueDate: input.dueDate }),
    shortcuts: shortcutHints(shortcuts),
    ...(input.shape && {
      words: input.shape.words,
      minutes: input.shape.minutes,
      context: input.shape.context,
      claudeWeight: input.shape.claudeWeight,
    }),
  });
}

// claude auth status 결과에서 앱이 쓰는 것만. 이 명령이 없는 옛 claude면 null(모름).
export interface ClaudeAuth {
  loggedIn: boolean;
  method: string | null; // "claude.ai"(구독) | API 키 등
  plan: string | null; // pro | max | team | enterprise
}

export function parseAuthStatus(stdout: string): ClaudeAuth | null {
  try {
    const d = JSON.parse(stdout) as { loggedIn?: unknown; authMethod?: unknown; subscriptionType?: unknown };
    if (typeof d.loggedIn !== "boolean") return null;
    return {
      loggedIn: d.loggedIn,
      method: typeof d.authMethod === "string" && d.authMethod !== "none" ? d.authMethod : null,
      plan: typeof d.subscriptionType === "string" ? d.subscriptionType : null,
    };
  } catch {
    return null;
  }
}

export interface ClaudeInfo {
  path: string | null;
  searched: string[];
  version: string | null;
  auth: ClaudeAuth | null;
}
