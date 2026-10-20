// 첫 행동 빚기(C1)의 순수 로직: 낱말 나누기, 크기, 출처별 비율.

import type { McpSource } from "./mcp.ts";

export const LOCAL_SOURCES = ["figma", "calendar", "files", "todoban"] as const;
export type LocalSource = (typeof LOCAL_SOURCES)[number];
export type ToolSource = LocalSource | McpSource;
export type SourceId = ToolSource | "claude";

// 도구에서 찾은 자료 하나. open은 맥 안에서만 쓰고 Claude에게 보내지 않는다.
export interface ToolItem {
  source: ToolSource;
  label: string;
  text?: string; // MCP 도구가 읽은 요약 (400자 이내). LOCAL 도구는 없음
  date: string | null; // 일정이나 끝낸 날짜 (YYYY-MM-DD)
  open: { kind: "shortcut"; id: string } | { kind: "file"; path: string } | { kind: "calendar" } | { kind: "url"; source: McpSource; url: string } | null;
}

export type ToolStatus = "ok" | "empty" | "slow" | "denied" | "failed" | "loading" | "needs-auth";
export interface ToolResult {
  source: ToolSource;
  status: ToolStatus;
  item: ToolItem | null;
}

// Claude에게 보내는 자료. 제목 한 줄과 비율, MCP 자료는 요약까지 보낸다.
export interface ContextItem {
  source: ToolSource;
  label: string;
  text?: string;
  date: string | null;
  weight: number;
}

export interface ShapeInput {
  words: string[];
  minutes: number;
  context: ContextItem[];
  claudeWeight: number;
}

// 조사는 떼되, 명사 끝 글자와 겹치기 쉬운 한 글자 조사(이·가·로·와·과·만·랑)는 3글자 넘게 남을 때만 뗀다. ("사일로" → 그대로)
const PARTICLES = /(에서|으로|까지|부터|이랑|하고|은|는|을|를|의|에|도)$/;
const WEAK_PARTICLES = /(이|가|로|와|과|만|랑)$/;
// 무엇을 할지 알려 주지 않는 흔한 말. C1에서 처음부터 꺼 둔다.
const STOP = new Set([
  "해야",
  "해야지",
  "해야함",
  "해야겠다",
  "하기",
  "하고",
  "되고",
  "되는데",
  "그리고",
  "좀",
  "일단",
  "다시",
  "너무",
  "진짜",
  "같은",
  "것",
  "거",
  "준비도",
  "봐야",
  "함",
  "할",
  "하는",
]);

export interface WordChip {
  word: string;
  on: boolean;
}

function stripParticle(token: string): string {
  const n = [...token].length;
  if (n > 2 && PARTICLES.test(token)) return token.replace(PARTICLES, "");
  if (n > 3 && WEAK_PARTICLES.test(token)) return token.replace(WEAK_PARTICLES, "");
  return token;
}

// 할 일 제목과 원문을 낱말로 나눈다. 같은 낱말은 한 번만, 조사는 떼고, 흔한 말은 꺼 둔다.
// 나눈 할 일의 원문에는 다른 할 일 문장도 들어 있으므로, 원문에만 있는 낱말은 꺼 둔 채로 보여 준다.
export function splitWords(title: string, rawText: string, max = 12): WordChip[] {
  const seen = new Set<string>();
  const chips: WordChip[] = [];
  const titleKeys = new Set<string>();
  const add = (text: string, fromTitle: boolean) => {
    for (const token of text.split(/[\s,.!?·…~()[\]{}"'“”‘’/]+/)) {
      if (!token || chips.length >= max) continue;
      const word = stripParticle(token) || token;
      const key = word.toLowerCase();
      if (fromTitle) titleKeys.add(key);
      if (seen.has(key) || [...word].length < 2) continue;
      seen.add(key);
      chips.push({ word, on: fromTitle && !STOP.has(word) && !STOP.has(token) });
    }
  };
  add(title, true);
  // 원문이 제목과 같으면(짧은 입력) 원문의 낱말도 켠다.
  add(rawText, rawText.trim() === title.trim());
  return chips;
}

export const SIZES = [5, 15, 30, 60, 120] as const;

export function sizeLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return minutes === 60 ? "1 hour" : `${minutes / 60} hours`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000);
}

// 맞는 일정이 있으면 남은 날로 크기를 정한다. 1일 이하 15분, 3일 이하 30분, 그 외 1시간. 없으면 30분.
export function defaultMinutes(deadline: string | null, today: string): { minutes: number; daysLeft: number | null } {
  if (!deadline) return { minutes: 30, daysLeft: null };
  const daysLeft = Math.max(0, daysBetween(today, deadline));
  return { minutes: daysLeft <= 1 ? 15 : daysLeft <= 3 ? 30 : 60, daysLeft };
}

export const CLAUDE_MIN = 10;

// 고른 도구만으로 기본 비율을 다시 나눈다. 합은 100, Claude 몫은 최소 10이다.
export function normalizeMix(defaults: Partial<Record<string, number>>, selected: ToolSource[]): Record<string, number> {
  if (!selected.length) return { claude: 100 };
  const raw = selected.map((s) => Math.max(1, defaults[s] ?? 15));
  const claudeRaw = Math.max(1, defaults.claude ?? 20);
  const total = raw.reduce((a, b) => a + b, 0) + claudeRaw;
  let claude = Math.max(CLAUDE_MIN, Math.round((claudeRaw / total) * 100));
  const rest = 100 - claude;
  const scaled = raw.map((r) => (r / (total - claudeRaw)) * rest);
  const floored = scaled.map(Math.floor);
  // 반올림 오차는 소수점이 큰 칸부터 1씩 채운다.
  let left = rest - floored.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floored[i]! += 1;
    left -= 1;
  }
  const mix: Record<string, number> = {};
  selected.forEach((s, i) => (mix[s] = floored[i]!));
  mix.claude = claude;
  return mix;
}

// 비율 막대의 경계 하나를 옮긴다. i번 칸과 i+1번 칸만 바뀌고, 각 칸은 최소값을 지킨다.
export function moveEdge(values: number[], i: number, delta: number, mins: number[]): number[] {
  const next = [...values];
  const a = next[i]!;
  const b = next[i + 1]!;
  const d = Math.max(mins[i]! - a, Math.min(b - mins[i + 1]!, Math.round(delta)));
  next[i] = a + d;
  next[i + 1] = b - d;
  return next;
}

// Claude가 돌려준 출처 중 보내지 않은 것은 버린다. 비율은 0~100으로 자른다.
export function keepSentSources<T extends { source: string; weight: number }>(sources: T[], sent: string[]): T[] {
  const allowed = new Set([...sent, "claude"]);
  return sources.filter((s) => allowed.has(s.source)).map((s) => ({ ...s, weight: Math.max(0, Math.min(100, Math.round(s.weight))) }));
}
