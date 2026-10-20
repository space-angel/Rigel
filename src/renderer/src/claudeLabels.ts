import type { ClaudeAuth } from "@shared/claude";
import { loc, t } from "./i18n";

// 홈 폴더를 ~로 줄인다(맥 /Users/이름, 윈도우 C:\Users\이름)
export function homeShort(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, "~").replace(/^[A-Za-z]:\\Users\\[^\\]+/, "~");
}

// 어떤 계정으로 연결됐는지 한 마디로: “Team 구독”, “API 키”. 모르면 null.
export function authLabel(auth: ClaudeAuth | null): string | null {
  if (!auth?.loggedIn) return null;
  if (auth.method === "claude.ai") {
    const plan = auth.plan ? auth.plan[0]!.toUpperCase() + auth.plan.slice(1) : null;
    return plan ? t("{plan} plan", { plan }) : t("Claude subscription");
  }
  return t("API key");
}

// 한도가 풀리는 때(“3pm”, “7:30pm”, “15:00”)를 화면 언어로: 오후 3시 / 3 PM
export function resetTime(raw: string): string {
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return raw;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d.toLocaleTimeString(loc(), { hour: "numeric", ...(min ? { minute: "2-digit" } : {}) });
}

// claude --version의 “2.1.304 (Claude Code)”에서 번호만
export const shortVersion = (v: string | null) => v?.replace(/\s*\(Claude Code\)/, "") ?? null;
