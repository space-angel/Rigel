import { spawn } from "node:child_process";
import { ClaudeError } from "@shared/claude";
import { CollectResult, MCP_SERVICES, allowedTools, collectRequest, figmaTarget, parseMcpList, safeServiceUrl, type McpSource, type McpStatus } from "@shared/mcp";
import type { ToolResult } from "@shared/shape";
import type { AppData, TodoItem } from "@shared/types";
import { localDate } from "@shared/todos";
import { matchShortcutByKeywords } from "@shared/quickInput";
import { EXTRA_PATHS, ensureWorkDir, findClaude } from "../claude/setup";

// MCP 도구는 collect 호출 하나에서만 연다 (7-a 측정).
// claude.ai 커넥터는 user 설정에서만 보이고, 내장 도구는 MCP 도구를 찾는 ToolSearch만 연다.
// dontAsk 모드라 허용 목록 밖의 도구(쓰기 포함)는 묻지 않고 막힌다.
const COLLECT_TIMEOUT_MS = 30_000;

function collectArgs(source: McpSource, model: string | null): string[] {
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
    ...allowedTools(source),
  ];
}

function env() {
  return { ...process.env, PATH: [...EXTRA_PATHS, process.env.PATH ?? ""].join(":") };
}

// 피그마 프레임은 할 일에 연결된 바로가기, 없으면 낱말이 맞는 바로가기에서 고른다.
function frameTarget(todo: TodoItem, words: string[], data: AppData) {
  const id = todo.shortcutId ?? matchShortcutByKeywords(`${todo.title} ${words.join(" ")}`, data.shortcuts);
  const s = data.shortcuts.find((x) => x.id === id);
  return s ? figmaTarget(s.url) : null;
}

export async function collectMcp(source: McpSource, todo: TodoItem, words: string[], data: AppData, signal: AbortSignal): Promise<ToolResult> {
  const target = source === "frame" ? frameTarget(todo, words, data) : null;
  if (source === "frame" && !target) return { source, status: "empty", item: null };
  const { path } = await findClaude(data.settings.claudePath);
  if (!path) return { source, status: "failed", item: null };

  const lines = await new Promise<Record<string, any>[]>((resolve, reject) => {
    const child = spawn(path, collectArgs(source, data.settings.model), { cwd: ensureWorkDir(), env: env() });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new ClaudeError("timeout", "collect 시간 초과"));
    }, COLLECT_TIMEOUT_MS);
    const onAbort = () => {
      child.kill("SIGTERM");
      reject(new ClaudeError("failed", "취소했어요"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d) => (out += d));
    child.on("error", (e) => reject(new ClaudeError("notFound", e.message)));
    child.on("close", () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
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
    child.stdin.end(collectRequest(source, words, localDate(), target));
  }).catch((e: ClaudeError) => e);

  if (lines instanceof ClaudeError) return { source, status: lines.kind === "timeout" ? "slow" : "failed", item: null };

  const init = lines.find((l) => l.subtype === "init");
  const server = init?.mcp_servers?.find((m: { name: string }) => m.name === MCP_SERVICES[source].server);
  if (server?.status === "needs-auth") return { source, status: "needs-auth", item: null };
  const result = lines.findLast((l) => l.type === "result");
  if (!result || result.is_error) return { source, status: "failed", item: null };
  try {
    const cleaned = String(result.result ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const item = CollectResult.parse(JSON.parse(cleaned)).items[0];
    if (!item) return { source, status: "empty", item: null };
    const url = safeServiceUrl(source, item.url);
    return {
      source,
      status: "ok",
      item: {
        source,
        label: item.label.slice(0, 80),
        text: item.text.slice(0, 400),
        date: item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null,
        open: url ? { kind: "url", source, url } : null,
      },
    };
  } catch {
    return { source, status: "failed", item: null };
  }
}

// `claude mcp list`는 서버마다 연결을 확인해서 10초쯤 걸린다. 5분 동안 기억한다.
let statusCache: { at: number; value: Promise<Record<string, McpStatus>> } | null = null;

export function mcpStatus(configuredPath: string | null, fresh = false): Promise<Record<string, McpStatus>> {
  if (!fresh && statusCache && Date.now() - statusCache.at < 5 * 60_000) return statusCache.value;
  const value = (async () => {
    const { path } = await findClaude(configuredPath);
    if (!path) return {};
    return new Promise<Record<string, McpStatus>>((resolve) => {
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
  })();
  statusCache = { at: Date.now(), value };
  return value;
}

// collect에서 needs-auth를 보면 목록 상태도 고친다. mcp list는 Connected라고 해도 print 모드에서는 인증이 필요할 수 있다.
export function markNeedsAuth(source: McpSource): void {
  if (!statusCache) return;
  const server = MCP_SERVICES[source].server;
  statusCache.value = statusCache.value.then((all) => ({ ...all, [server]: "needs-auth" }));
}
