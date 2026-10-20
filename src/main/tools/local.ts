import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";
import type { AppData, TodoItem } from "@shared/types";
import { localDate } from "@shared/todos";
import type { LocalSource, ToolItem, ToolResult } from "@shared/shape";

// LOCAL 도구: 앱이 맥 안에서 직접 읽는다. 결과는 제목 한 줄만 Claude에게 보내고, 링크나 경로는 맥 안에서만 쓴다.
// 캘린더는 처음 읽을 때 캘린더 앱을 깨우느라 느려서 3초, 나머지는 1초 안에 끝나야 한다.
const TIMEOUT_MS: Record<LocalSource, number> = { figma: 1000, calendar: 3000, files: 1000, todoban: 1000 };

function score(text: string, words: string[]): number {
  const t = text.toLowerCase();
  return words.filter((w) => t.includes(w.toLowerCase())).length;
}

function best<T>(items: T[], text: (x: T) => string, words: string[]): T | null {
  let top: T | null = null;
  let topScore = 0;
  for (const x of items) {
    const s = score(text(x), words);
    if (s > topScore) [top, topScore] = [x, s];
  }
  return top;
}

function figma(todo: TodoItem, words: string[], data: AppData): ToolItem | null {
  // 할 일에 이미 연결된 바로가기가 있으면 그걸 먼저 쓴다.
  const linked = data.shortcuts.find((s) => s.id === todo.shortcutId);
  const s = linked ?? best(data.shortcuts, (x) => [x.name, ...x.keywords].join(" "), words);
  if (!s) return null;
  let node: string | null = null;
  try {
    node = new URL(s.url).searchParams.get("node-id");
  } catch {}
  return { source: "figma", label: node ? `${s.name} · frame ${node}` : s.name, date: null, open: { kind: "shortcut", id: s.id } };
}

function todoban(todo: TodoItem, words: string[], data: AppData): ToolItem | null {
  const today = localDate();
  const others = data.todos.filter((t) => t.id !== todo.id && (t.completedAt || t.plannedDate === null || t.plannedDate > today));
  const t = best(others, (x) => x.title, words);
  if (!t) return null;
  const done = t.completedAt ? localDate(new Date(t.completedAt)) : null;
  return { source: "todoban", label: `${t.title} · ${done ? "done" : "later"}`, date: done, open: null };
}

function run(cmd: string, args: string[], timeout: number): Promise<{ stdout: string; stderr: string; failed: boolean; timedOut: boolean }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      resolve({ stdout, stderr, failed: Boolean(err), timedOut: Boolean(err && (err as { killed?: boolean }).killed) });
    });
  });
}

// 최근 7일에 연 문서 중 이름에 낱말이 들어간 것. 이름만 보낸다.
async function files(words: string[]): Promise<ToolItem | null | "slow"> {
  const names = words.slice(0, 4).map((w) => `kMDItemDisplayName == "*${w.replace(/["\\*]/g, "")}*"cd`);
  if (!names.length) return null;
  const query = `(${names.join(" || ")}) && kMDItemLastUsedDate >= $time.today(-7)`;
  const r = await run("/usr/bin/mdfind", ["-onlyin", homedir(), query], TIMEOUT_MS.files);
  if (r.timedOut) return "slow";
  const paths = r.stdout
    .split("\n")
    .filter((p) => p && !/\/(Library|node_modules|\.[^/]+)\//.test(p))
    .slice(0, 50);
  const scored = paths.map((p) => ({ p, s: score(basename(p), words), m: mtime(p) }));
  scored.sort((a, b) => b.s - a.s || b.m - a.m);
  const top = scored[0];
  return top ? { source: "files", label: basename(top.p), date: null, open: { kind: "file", path: top.p } } : null;
}

function mtime(p: string): number {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

// 캘린더 앱에서 앞으로 7일 일정 제목과 시작 시각을 읽는다. 처음 쓸 때 macOS가 자동화 권한을 묻는다.
const CALENDAR_JXA = `
function run(argv) {
  const Cal = Application("Calendar");
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 86400000);
  const out = [];
  for (const c of Cal.calendars()) {
    const evs = c.events.whose({ _and: [{ startDate: { _greaterThan: now } }, { startDate: { _lessThan: end } }] });
    const titles = evs.summary();
    const starts = evs.startDate();
    for (let i = 0; i < titles.length; i++) out.push({ title: titles[i], start: starts[i].toISOString() });
  }
  return JSON.stringify(out);
}`;

let calendarCache: { at: number; events: { title: string; start: string }[] } | null = null;
const CALENDAR_CACHE_MS = 10 * 60_000;

async function calendar(words: string[]): Promise<ToolItem | null | "slow" | "denied" | "failed"> {
  if (!calendarCache || Date.now() - calendarCache.at > CALENDAR_CACHE_MS) {
    const r = await run("/usr/bin/osascript", ["-l", "JavaScript", "-e", CALENDAR_JXA], TIMEOUT_MS.calendar);
    if (r.timedOut) return "slow";
    if (r.failed) return /-1743|Not authorized|not allowed/i.test(r.stderr) ? "denied" : "failed";
    try {
      calendarCache = { at: Date.now(), events: JSON.parse(r.stdout) };
    } catch {
      return "failed";
    }
  }
  const ev = best(calendarCache.events, (e) => e.title, words);
  if (!ev) return null;
  const d = new Date(ev.start);
  const when = d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined });
  return { source: "calendar", label: `${ev.title} · ${when}`, date: localDate(d), open: { kind: "calendar" } };
}

function wrap(source: LocalSource, item: ToolItem | null | "slow" | "denied" | "failed"): ToolResult {
  if (item === "slow" || item === "denied" || item === "failed") return { source, status: item, item: null };
  return { source, status: item ? "ok" : "empty", item };
}

// 켜 둔 LOCAL 도구를 한꺼번에 읽는다. 하나가 느리거나 실패해도 나머지는 그대로 돌려준다.
export async function collectLocal(todo: TodoItem, words: string[], data: AppData): Promise<ToolResult[]> {
  const on = data.settings.tools.local;
  const jobs: Promise<ToolResult>[] = [];
  if (on.figma) jobs.push(Promise.resolve(wrap("figma", figma(todo, words, data))));
  if (on.calendar) jobs.push(calendar(words).then((x) => wrap("calendar", x)));
  if (on.files) jobs.push(files(words).then((x) => wrap("files", x)));
  if (on.todoban) jobs.push(Promise.resolve(wrap("todoban", todoban(todo, words, data))));
  return Promise.all(jobs);
}
