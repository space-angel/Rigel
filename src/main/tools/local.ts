import { execFile } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { NATURAL_MAX_WORDS, evidenceLines, firstLines, isDocumentPath, rankFiles, spotlightQuery } from "@shared/fileMatch";
import type { AppData, TodoItem } from "@shared/types";
import { localDate } from "@shared/todos";
import type { LocalSource, ToolItem, ToolResult } from "@shared/shape";

// LOCAL 도구: 앱이 맥 안에서 직접 읽는다. 결과는 제목 한 줄만 Claude에게 보내고, 링크나 경로는 맥 안에서만 쓴다.
// 캘린더는 처음 읽을 때 캘린더 앱을 깨우느라 느려서 3초, 파일은 내용 검색이라 2.5초, 나머지는 1초 안에 끝나야 한다.
const TIMEOUT_MS: Record<LocalSource, number> = { figma: 1000, calendar: 3000, files: 2500, todoban: 1000 };

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

// Files: 이름이나 내용에 낱말이 들어 있고 최근 30일에 열었거나 고친 문서(Spotlight).
// 근거 줄은 맥 안에서 읽어 화면에만 보여 주고, Claude에게는 파일 이름만 보낸다.
const TEXT_EXT = /\.(txt|md|markdown|csv|json|html?|org|tex)$/i;
const TEXTUTIL_EXT = /\.(docx?|rtf|rtfd|odt|webarchive)$/i;

async function readText(p: string): Promise<string | null> {
  try {
    if (statSync(p).size > 2_000_000) return null;
    if (TEXT_EXT.test(p)) return readFileSync(p, "utf8").slice(0, 200_000);
    if (TEXTUTIL_EXT.test(p)) {
      const r = await run("/usr/bin/textutil", ["-convert", "txt", "-stdout", p], 1500);
      return r.failed ? null : r.stdout.slice(0, 200_000);
    }
  } catch {}
  return null;
}

async function files(words: string[]): Promise<ToolItem | null | "slow"> {
  const query = spotlightQuery(words);
  if (!query) return null;
  const since = Date.now() - 30 * 86_400_000;
  const natural = words.filter((w) => w.length > 1).slice(0, NATURAL_MAX_WORDS);
  const [r, ...nat] = await Promise.all([
    run("/usr/bin/mdfind", ["-onlyin", homedir(), query], TIMEOUT_MS.files),
    ...natural.map((w) => run("/usr/bin/mdfind", ["-onlyin", homedir(), w], TIMEOUT_MS.files)),
  ]);
  if (r.timedOut && nat.every((x) => x.timedOut)) return "slow";
  const fromNatural = nat
    .flatMap((x) => x.stdout.split("\n").slice(0, 3000))
    .filter(isDocumentPath)
    .filter((p) => mtime(p) >= since);
  const paths = [...new Set([...r.stdout.split("\n").filter(isDocumentPath), ...fromNatural])].slice(0, 60);
  // 최근 것부터 12개만 내용을 읽는다(시간 제한 안에 끝나게).
  const recent = paths.map((p) => ({ p, m: mtime(p) })).sort((x, y) => y.m - x.m).slice(0, 12);
  const cands = await Promise.all(recent.map(async ({ p, m }) => ({ path: p, name: basename(p).normalize("NFC"), modified: m, content: await readText(p) })));
  const top = rankFiles(cands, words)[0];
  if (!top) return null;
  const quote = top.content ? (evidenceLines(top.content, words) ?? firstLines(top.content)) : null;
  const home = homedir();
  return {
    source: "files",
    label: top.name,
    date: null,
    open: { kind: "file", path: top.path },
    where: dirname(top.path).replace(home, "~"),
    ...(quote && { preview: quote }),
    matchedIn: top.inName && top.inContent ? "both" : top.inName ? "name" : "content",
    ...(top.modified && { modified: localDate(new Date(top.modified)) }),
  };
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
