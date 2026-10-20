import { spawn } from "node:child_process";
import { ClaudeError } from "@shared/claude";
import { CollectManyResult, CollectResult, MCP_SERVICES, collectManyRequest, type CollectTask, type EnrichStatus, WhoamiResult, allowedTools, collectRequest, figmaTarget, parseMcpList, safeServiceUrl, searched, toolPrefix, whoamiRequest, type McpSource, type McpStatus } from "@shared/mcp";
import type { ToolResult } from "@shared/shape";
import type { AppData, ContextNote, TodoItem } from "@shared/types";
import { splitWords } from "@shared/shape";
import { localDate } from "@shared/todos";
import { matchShortcutByKeywords } from "@shared/quickInput";
import { EXTRA_PATHS, ensureWorkDir, findClaude } from "../claude/setup";

// MCP 도구는 collect 호출 하나에서만 연다 (7-a 측정).
// claude.ai 커넥터는 user 설정에서만 보이고, 내장 도구는 MCP 도구를 찾는 ToolSearch만 연다.
// dontAsk 모드라 허용 목록 밖의 도구(쓰기 포함)는 묻지 않고 막힌다.
const COLLECT_TIMEOUT_MS = 30_000;

function collectArgs(source: McpSource, model: string | null, kind: "collect" | "whoami"): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--no-session-persistence",
    "--setting-sources",
    "user,project",
    "--tools",
    "ToolSearch",
    "--permission-mode",
    "dontAsk",
    ...(model ? ["--model", model] : []),
    "--allowedTools",
    ...allowedTools(source, kind),
  ];
}

function env() {
  return { ...process.env, PATH: [...EXTRA_PATHS, process.env.PATH ?? ""].join(":") };
}

// 피그마 프레임은 할 일에 연결된 바로가기, 없으면 낱말이 맞는 바로가기에서 고른다.
function frameShortcut(todo: TodoItem, words: string[], data: AppData) {
  const id = todo.shortcutId ?? matchShortcutByKeywords(`${todo.title} ${words.join(" ")}`, data.shortcuts);
  return data.shortcuts.find((x) => x.id === id) ?? null;
}

type Line = Record<string, any>;

// claude를 한 번 실행해 stream-json 줄을 모두 받는다.
function runOnce(path: string, args: string[], body: string, signal?: AbortSignal, timeoutMs = COLLECT_TIMEOUT_MS): Promise<Line[] | ClaudeError> {
  return new Promise<Line[]>((resolve, reject) => {
    const child = spawn(path, args, { cwd: ensureWorkDir(), env: env() });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new ClaudeError("timeout", "collect 시간 초과"));
    }, timeoutMs);
    const onAbort = () => {
      child.kill("SIGTERM");
      reject(new ClaudeError("failed", "취소했어요"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d) => (out += d));
    child.on("error", (e) => reject(new ClaudeError("notFound", e.message)));
    child.on("close", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(
        out
          .split("\n")
          .filter((l) => l.startsWith("{"))
          .flatMap((l) => {
            try {
              return [JSON.parse(l)];
            } catch {
              return [];
            }
          }),
      );
    });
    child.stdin.on("error", () => {});
    child.stdin.end(body);
  }).catch((e: ClaudeError) => e);
}

const calledTools = (lines: Line[]): string[] =>
  lines
    .filter((l) => l.type === "assistant")
    .flatMap((l) => l.message?.content ?? [])
    .filter((c: { type: string }) => c.type === "tool_use")
    .map((c: { name: string }) => c.name);
const needsAuth = (lines: Line[], source: McpSource) =>
  lines.find((l) => l.subtype === "init")?.mcp_servers?.find((m: { name: string }) => m.name === MCP_SERVICES[source].server)?.status === "needs-auth";
const resultJson = (lines: Line[]): unknown => {
  const result = lines.findLast((l) => l.type === "result");
  if (!result || result.is_error) return null;
  try {
    return JSON.parse(String(result.result ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return null;
  }
};

// 같은 서비스·같은 낱말(·같은 프레임)로 15분 안에 다시 읽으면 Claude를 다시 부르지 않는다. 한 번 읽는 데 11초쯤 걸린다.
const CACHE_MS = 15 * 60_000;
const collectCache = new Map<string, { at: number; result: ToolResult }>();

export async function collectMcp(source: McpSource, todo: TodoItem, words: string[], data: AppData, signal: AbortSignal): Promise<ToolResult> {
  const key = `${source}|${source === "frame" ? (frameShortcut(todo, words, data)?.url ?? "") : ""}|${[...words].sort().join(",")}`;
  const hit = collectCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const result = await collectOnce(source, todo, words, data, signal);
  // 찾았거나 확실히 없을 때만 기억한다. 실패·인증 필요는 다음에 다시 읽는다.
  if (result.status === "ok" || result.status === "empty") collectCache.set(key, { at: Date.now(), result });
  return result;
}

async function collectOnce(source: McpSource, todo: TodoItem, words: string[], data: AppData, signal: AbortSignal): Promise<ToolResult> {
  const shortcut = source === "frame" ? frameShortcut(todo, words, data) : null;
  const target = shortcut ? figmaTarget(shortcut.url) : null;
  if (source === "frame" && !target) return { source, status: "empty", item: null };
  const { path } = await findClaude(data.settings.claudePath);
  if (!path) return { source, status: "failed", item: null };

  // 검색 도구를 한 번도 부르지 않고 답하면(가끔 그냥 "없음"을 낸다) 한 번 더 시킨다. 그래도 안 부르면 믿지 않는다.
  let lines: Line[] | ClaudeError = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    lines = await runOnce(path, collectArgs(source, data.settings.model, "collect"), collectRequest(source, words, localDate(), target), signal);
    if (lines instanceof ClaudeError) return { source, status: lines.kind === "timeout" ? "slow" : "failed", item: null };
    if (needsAuth(lines, source)) return { source, status: "needs-auth", item: null };
    if (searched(source, calledTools(lines))) break;
    if (attempt === 1) return { source, status: "failed", item: null };
  }

  const parsed = CollectResult.safeParse(resultJson(lines as Line[]));
  if (!parsed.success) return { source, status: "failed", item: null };
  const item = parsed.data.items[0];
  if (!item) return { source, status: "empty", item: null };
  const url = safeServiceUrl(source, item.url);
  const info = data.settings.tools.mcpInfo[source];
  return {
    source,
    status: "ok",
    item: {
      source,
      label: item.label.slice(0, 80),
      text: item.text.slice(0, 400),
      date: item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null,
      // 피그마 프레임은 읽은 바로가기 링크를 피그마 앱으로 연다.
      open: shortcut ? { kind: "figma", url: shortcut.url } : url ? { kind: "url", source, url } : null,
      ...(info?.workspace && { workspace: info.workspace }),
    },
  };
}

// 확인 창: 나눈 할 일들에 맞는 자료를 서비스마다 한 번에 찾는다. 할 일 하나에 자료는 최대 하나.

export async function collectManyMcp(
  source: McpSource,
  drafts: { key: string; title: string; shortcutId: string | null }[],
  data: AppData,
  signal: AbortSignal,
): Promise<{ status: EnrichStatus; notes: Record<string, ContextNote> }> {
  const none = (status: EnrichStatus) => ({ status, notes: {} });
  const frameUrl: Record<string, string> = {};
  const tasks: CollectTask[] = drafts.slice(0, 6).flatMap((d) => {
    const words = splitWords(d.title, d.title).filter((w) => w.on).map((w) => w.word);
    if (source !== "frame") return [{ key: d.key, title: d.title, words }];
    // 피그마 프레임은 바로가기가 맞는 할 일만 읽는다.
    const id = d.shortcutId ?? matchShortcutByKeywords(d.title, data.shortcuts);
    const url = data.shortcuts.find((s) => s.id === id)?.url ?? "";
    const target = figmaTarget(url);
    if (target) frameUrl[d.key] = url;
    return target ? [{ key: d.key, title: d.title, words, target }] : [];
  });
  if (!tasks.length) return none("empty");
  const { path } = await findClaude(data.settings.claudePath);
  if (!path) return none("failed");

  let lines: Line[] | ClaudeError = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    lines = await runOnce(path, collectArgs(source, data.settings.model, "collect"), collectManyRequest(source, tasks, localDate()), signal, 60_000);
    if (lines instanceof ClaudeError) return none(lines.kind === "timeout" ? "slow" : "failed");
    if (needsAuth(lines, source)) return none("needs-auth");
    if (searched(source, calledTools(lines))) break;
    if (attempt === 1) return none("failed");
  }
  const parsed = CollectManyResult.safeParse(resultJson(lines as Line[]));
  if (!parsed.success) return none("failed");
  const keys = new Set(tasks.map((t) => t.key));
  const workspace = data.settings.tools.mcpInfo[source]?.workspace ?? null;
  const notes: Record<string, ContextNote> = {};
  for (const item of parsed.data.items) {
    if (!keys.has(item.key) || notes[item.key]) continue;
    notes[item.key] = {
      source,
      label: item.label.slice(0, 80),
      text: item.text.slice(0, 400),
      date: item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null,
      url: source === "frame" ? (frameUrl[item.key] ?? null) : safeServiceUrl(source, item.url),
      path: null,
      workspace,
    };
  }
  return { status: Object.keys(notes).length ? "done" : "empty", notes };
}

// 연결 상태 확인. 1) claude를 띄워 시작 메시지(init)의 서버 상태만 읽고 바로 끈다 — 모델을 부르지 않고 3초쯤 걸린다.
// print 모드에서 실제로 쓸 수 있는지가 여기 보인다(mcp list는 Connected여도 여기선 needs-auth일 수 있음).
// 2) 아직 연결 중(pending)인 서버는 `claude mcp list`(10초쯤)로 다시 본다. 결과는 5분 동안 기억한다.
let statusCache: { at: number; value: Promise<Record<string, McpStatus>> } | null = null;

function probeInit(path: string): Promise<Record<string, McpStatus>> {
  return new Promise((resolve) => {
    const child = spawn(path, ["-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--setting-sources", "user,project", "--tools", ""], {
      cwd: ensureWorkDir(),
      env: env(),
    });
    let buf = "";
    const done = (v: Record<string, McpStatus>) => {
      clearTimeout(timer);
      child.kill("SIGTERM");
      resolve(v);
    };
    const timer = setTimeout(() => done({}), 15_000);
    child.stdout.on("data", (d) => {
      buf += d;
      const line = buf.split("\n").find((l) => l.includes('"subtype":"init"'));
      if (!line) return;
      try {
        const init = JSON.parse(line);
        done(Object.fromEntries((init.mcp_servers ?? []).map((m: { name: string; status: string }) => [m.name, normalizeStatus(m.status)])));
      } catch {
        done({});
      }
    });
    child.on("error", () => done({}));
    child.stdin.on("error", () => {});
    child.stdin.end("status");
  });
}

function normalizeStatus(s: string): McpStatus {
  return s === "connected" || s === "needs-auth" || s === "pending" ? s : "failed";
}

function mcpList(path: string): Promise<Record<string, McpStatus>> {
  return new Promise((resolve) => {
    const child = spawn(path, ["mcp", "list"], { env: env() });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 30_000);
    child.stdout.on("data", (d) => (out += d));
    child.on("error", () => resolve({}));
    child.on("close", () => {
      clearTimeout(timer);
      resolve(parseMcpList(out));
    });
  });
}

export function mcpStatus(configuredPath: string | null, fresh = false): Promise<Record<string, McpStatus>> {
  if (!fresh && statusCache && Date.now() - statusCache.at < 5 * 60_000) return statusCache.value;
  const value = (async () => {
    const { path } = await findClaude(configuredPath);
    if (!path) return {};
    const init = await probeInit(path);
    const ours = Object.values(MCP_SERVICES).map((s) => s.server);
    if (!ours.some((name) => !init[name] || init[name] === "pending")) return init;
    const listed = await mcpList(path);
    const merged = { ...init };
    // 시작할 때 아직 연결 중이던 서버(피그마가 자주 그렇다)는 mcp list 값을 쓴다. 켤 때 실제로 읽어 보고 확정한다.
    for (const name of ours) if (!merged[name] || merged[name] === "pending") merged[name] = listed[name] ?? "missing";
    return merged;
  })();
  statusCache = { at: Date.now(), value };
  return value;
}

// 켤 때 어느 워크스페이스·계정에 연결됐는지 확인한다. 이 도구가 불리면 연결과 권한도 함께 확인된다.
export async function verifyMcp(source: McpSource, data: AppData): Promise<{ ok: boolean; status: string; ms: number; workspace: string | null; account: string | null }> {
  const started = Date.now();
  const fail = (status: string) => ({ ok: false, status, ms: Date.now() - started, workspace: null, account: null });
  const { path } = await findClaude(data.settings.claudePath);
  if (!path) return fail("failed");
  const lines = await runOnce(path, collectArgs(source, data.settings.model, "whoami"), whoamiRequest(source));
  if (lines instanceof ClaudeError) return fail(lines.kind === "timeout" ? "slow" : "failed");
  if (needsAuth(lines, source)) {
    markNeedsAuth(source);
    return fail("needs-auth");
  }
  const whoami = toolPrefix(MCP_SERVICES[source].server) + MCP_SERVICES[source].whoami;
  if (!calledTools(lines).includes(whoami)) return fail("failed");
  const parsed = WhoamiResult.safeParse(resultJson(lines));
  if (!parsed.success) return fail("failed");
  return { ok: true, status: "ok", ms: Date.now() - started, ...parsed.data };
}

// collect에서 needs-auth를 보면 목록 상태도 고친다. mcp list는 Connected라고 해도 print 모드에서는 인증이 필요할 수 있다.
export function markNeedsAuth(source: McpSource): void {
  if (!statusCache) return;
  const server = MCP_SERVICES[source].server;
  statusCache.value = statusCache.value.then((all) => ({ ...all, [server]: "needs-auth" }));
}
