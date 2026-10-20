// MCP collect가 실제로 무엇을 어떻게 찾는지 기록한다: Claude가 부른 도구와 넣은 검색어, 고른 자료, 낱말이 요약에 들어갔는지.
// 앱(src/main/tools/mcp.ts)과 같은 설정으로 claude를 실행한다.
// 실행: node scripts/match-probe.ts [--out docs/qa/match-probe.json]
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { allowedTools, collectRequest, whoamiRequest, type McpSource } from "../src/shared/mcp.ts";

const claudePath = [join(homedir(), ".local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find((p) => existsSync(p));
if (!claudePath) throw new Error("claude 실행 파일을 찾지 못했어요");
const workDir = mkdtempSync(join(tmpdir(), "todoban-match-"));
copyFileSync(new URL("../resources/claude/CLAUDE.md", import.meta.url), join(workDir, "CLAUDE.md"));
const env = { ...process.env, PATH: ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local/bin"), process.env.PATH].join(":") };

const FILE = "uLkrdQtbosV1DMYSYHsYeB"; // todoBAN 피그마 파일
interface Case {
  source: McpSource;
  words: string[];
  target?: { fileKey: string; nodeId: string };
  expect: "match" | "none";
  note: string;
}
const CASES: Case[] = [
  { source: "notion", words: ["면접", "준비"], expect: "match", note: "면접 관련 페이지가 있음" },
  { source: "notion", words: ["포트폴리오"], expect: "match", note: "" },
  { source: "notion", words: ["운동", "루틴"], expect: "none", note: "관련 페이지가 없을 것으로 예상" },
  { source: "linear", words: ["todoBAN"], expect: "none", note: "Linear에 todoBAN 이슈는 없음" },
  { source: "linear", words: ["디자인", "QA"], expect: "match", note: "있을 수도 있음" },
  { source: "frame", words: ["면접", "자기소개"], target: { fileKey: FILE, nodeId: "63:527" }, expect: "match", note: "C2 Your first step: 면접·자기소개 글이 있음" },
  { source: "frame", words: ["운동", "헬스"], target: { fileKey: FILE, nodeId: "63:527" }, expect: "none", note: "같은 프레임, 관련 글 없음" },
  { source: "frame", words: ["바로가기", "포폴"], target: { fileKey: FILE, nodeId: "65:272" }, expect: "match", note: "D3 Shortcuts: 포폴 바로가기 목록" },
  { source: "frame", words: ["캘린더", "일정"], target: { fileKey: FILE, nodeId: "65:272" }, expect: "none", note: "같은 프레임, 관련 글 없음" },
];

function args(source: McpSource, kind: "collect" | "whoami" = "collect"): string[] {
  return ["-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--setting-sources", "user,project", "--tools", "ToolSearch", "--permission-mode", "dontAsk", "--model", "sonnet", "--allowedTools", ...allowedTools(source, kind)];
}

function run(c: Case): Promise<{ ms: number; lines: any[] }> {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(claudePath!, args(c.source), { cwd: workDir, env });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 60_000);
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => {
      clearTimeout(timer);
      resolve({ ms: performance.now() - started, lines: out.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)) });
    });
    child.stdin.end(collectRequest(c.source, c.words, new Date().toISOString().slice(0, 10), c.target));
  });
}

const rows: unknown[] = [];
for (const c of CASES) {
  const { ms, lines } = await run(c);
  const calls = lines
    .filter((l) => l.type === "assistant")
    .flatMap((l) => l.message.content)
    .filter((x: { type: string; name?: string }) => x.type === "tool_use" && !String(x.name).endsWith("ToolSearch"))
    .map((x: { name: string; input: unknown }) => ({ tool: x.name.split("__").pop(), input: x.input }));
  const result = lines.findLast((l) => l.type === "result");
  let item: { label?: string; text?: string; url?: string } | null = null;
  try {
    const cleaned = String(result?.result ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    item = JSON.parse(cleaned).items?.[0] ?? null;
  } catch {}
  const denied = (result?.permission_denials ?? []).map((d: { tool_name: string }) => d.tool_name.split("__").pop());
  const hay = `${item?.label ?? ""} ${item?.text ?? ""}`;
  const wordsFound = c.words.filter((w) => hay.includes(w));
  const got = item ? "match" : "none";
  const row = { ...c, ms: Math.round(ms), calls, denied, label: item?.label ?? null, text: item?.text?.slice(0, 160) ?? null, wordsFound, got, asExpected: got === c.expect };
  rows.push(row);
  console.log(`${c.source.padEnd(6)} [${c.words.join(", ")}] ${(ms / 1000).toFixed(1)}s → ${got}${row.asExpected ? "" : " (예상과 다름)"} · 낱말 ${wordsFound.length}/${c.words.length}`);
  for (const call of calls) console.log(`    ${denied.includes(call.tool) ? "✗ 막힘 " : ""}${call.tool} ${JSON.stringify(call.input).slice(0, 160)}`);
  if (item) console.log(`    ⇒ ${item.label}`);
}
// 어느 워크스페이스·계정에 연결됐는지
const who: Record<string, unknown> = {};
for (const source of ["notion", "linear", "frame"] as McpSource[]) {
  const started = performance.now();
  const lines: any[] = await new Promise((resolve) => {
    const child = spawn(claudePath!, args(source, "whoami"), { cwd: workDir, env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => resolve(out.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l))));
    child.stdin.end(whoamiRequest(source));
  });
  const result = lines.findLast((l) => l.type === "result");
  who[source] = { ms: Math.round(performance.now() - started), result: String(result?.result ?? "").trim() };
  console.log(`whoami ${source.padEnd(6)} ${((performance.now() - started) / 1000).toFixed(1)}s → ${String(result?.result ?? "").trim().slice(0, 160)}`);
}
rows.push({ whoami: who });
const outIdx = process.argv.indexOf("--out");
if (outIdx > 0) writeFileSync(process.argv[outIdx + 1]!, JSON.stringify(rows, null, 2));
