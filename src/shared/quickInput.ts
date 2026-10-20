// 빠른 입력 문장을 어떻게 처리할지 정한다. 한 줄이고 30자 이하면 AI 없이 바로 넣는다.
export const SHORT_INPUT_MAX = 30;

export type QuickInputKind = "empty" | "short" | "long";

export function charCount(text: string): number {
  return [...text.trim()].length;
}

export function classifyQuickInput(text: string): QuickInputKind {
  const t = text.trim();
  if (!t) return "empty";
  if (t.includes("\n")) return "long";
  return charCount(t) <= SHORT_INPUT_MAX ? "short" : "long";
}

// 나누지 못했을 때 넣을 제목: 원래 문장의 첫 줄.
export function firstLine(text: string): string {
  return text.trim().split("\n")[0]!.trim();
}
