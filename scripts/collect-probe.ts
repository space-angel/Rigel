// 7-a단계: MCP 도구를 읽기 전용으로 여는 collect 호출이 동작하는지, 몇 초 걸리는지 잰다.
// 실행: node scripts/collect-probe.ts [--source notion] [--runs 3]
// 자료 내용은 출력하지 않는다. 시간, 서버 상태, 부른 도구, 막힌 도구, 찾은 개수만 본다.
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  join(homedir(), ".local/bin/claude"),
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  join(homedir(), ".claude/local/claude"),
];
const claudePath = CANDIDATES.find((p) => existsSync(p));
if (!claudePath) throw new Error("claude 실행 파일을 찾지 못했어요");

// 서비스별로 여는 읽기 도구. 쓰기 도구는 적지 않는다 — dontAsk 모드라 목록 밖은 모두 막힌다.
const SOURCES: Record<string, { server: string; tools: string[]; words: string[] }> = {
  notion: { server: "claude.ai Notion", tools: ["notion-search", "notion-fetch"], words: ["면접", "포트폴리오"] },
  linear: { server: "claude.ai Linear", tools: ["list_issues", "get_issue"], words: ["todoBAN"] },
};

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const sourceId = arg("--source") ?? "notion";
const runs = Number(arg("--runs")) || 3;
const source = SOURCES[sourceId];
if (!source) throw new Error(`모르는 source: ${sourceId}`);

const prefix = `mcp__${source.server.replace(/[^A-Za-z0-9]+/g, "_")}__`;
const args = [
  "-p",
  "--output-format",
  "stream-json",
  "--verbose",
  "--no-session-persistence",
  "--model",
  "sonnet",
  // claude.ai 커넥터는 user 설정에서만 보인다. 내장 도구는 MCP 도구를 찾는 ToolSearch만 연다.
  "--setting-sources",
  "user,project",
  "--tools",
  "ToolSearch",
  "--permission-mode",
  "dontAsk",
  "--allowedTools",
  "ToolSearch",
  ...source.tools.map((t) => prefix + t),
];
const body = [
  JSON.stringify({ type: "collect", source: sourceId, words: source.words, today: new Date().toISOString().slice(0, 10) }),
  `Use the ${source.server.replace("claude.ai ", "")} tools to find at most one item best matching the words. Read only. Never create, update, send, or comment.`,
  'Output JSON only: {"items":[{"label":"title","text":"summary under 400 chars","date":"YYYY-MM-DD" or null}]} or {"items":[]}.',
].join("\n");

const workDir = mkdtempSync(join(tmpdir(), "todoban-collect-"));
const env = { ...process.env, PATH: ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local/bin"), process.env.PATH].join(":") };

function run(): Promise<{ ms: number; lines: any[] }> {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(claudePath!, args, { cwd: workDir, env });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 60_000);
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => {
      clearTimeout(timer);
      const lines = out.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
      resolve({ ms: performance.now() - started, lines });
    });
    child.stdin.end(body);
  });
}

console.log(`claude: ${claudePath}\nsource: ${sourceId} (${source.server})\n`);
const times: number[] = [];
for (let r = 0; r < runs; r++) {
  const { ms, lines } = await run();
  const init = lines.find((l) => l.subtype === "init");
  const status = init?.mcp_servers?.find((m: { name: string }) => m.name === source.server)?.status ?? "missing";
  const calls = lines
    .filter((l) => l.type === "assistant")
    .flatMap((l) => l.message.content)
    .filter((c: { type: string }) => c.type === "tool_use")
    .map((c: { name: string }) => c.name.split("__").pop());
  const result = lines.findLast((l) => l.type === "result");
  let items: number | string = "파싱 실패";
  try {
    const cleaned = String(result?.result ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    items = JSON.parse(cleaned).items.length;
  } catch {}
  const denied = (result?.permission_denials ?? []).map((d: { tool_name: string }) => d.tool_name.split("__").pop());
  times.push(ms);
  console.log(`#${r + 1}: ${(ms / 1000).toFixed(1)}s · 서버 ${status} · 부름 ${calls.join(", ") || "없음"} · 막힘 ${denied.join(", ") || "없음"} · 찾음 ${items}`);
}
const avg = (times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1);
console.log(`\n평균 ${avg}s · 최대 ${(Math.max(...times) / 1000).toFixed(1)}s`);
