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

// 짧은 입력은 AI를 부르지 않으므로, 이름이나 부르는 말이 문장에 들어 있으면 앱이 직접 연결한다.
// 여러 개가 맞으면 더 긴 말이 맞은 쪽을 고른다 ("포트폴리오 사이트"가 "포폴"보다 구체적이다).
export function matchShortcutByKeywords(text: string, shortcuts: { id: string; name: string; keywords: string[] }[]): string | null {
  const t = text.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const s of shortcuts) {
    for (const k of [s.name, ...s.keywords]) {
      const kw = k.trim().toLowerCase();
      if (kw && t.includes(kw) && (!best || kw.length > best.len)) best = { id: s.id, len: kw.length };
    }
  }
  return best?.id ?? null;
}
