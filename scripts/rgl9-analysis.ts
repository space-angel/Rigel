// RGL-9: MCP로 가져온 자료가 할 일과 왜 안 맞는지 사례로 나눈다.
// 할 일마다 두 번 돌린다.
//   A(지금 방식): 앱과 같은 규칙(CLAUDE.md)·같은 도구·같은 낱말로 collect / collectMany. 부른 도구, 검색어, 결과, 고른 자료를 모두 남긴다.
//   B(기준선): 같은 서비스를 본문 읽기까지 허용하고, 할 일 원문과 같은 메모의 다른 할 일을 주고 충분히 찾게 한다.
//              가장 맞는 자료 3개와 관련도(0~3), A가 고른 자료의 관련도를 받는다.
// 실행: node scripts/rgl9-analysis.ts --data <data.json> --out <결과 폴더> [--sources notion,linear] [--limit N] [--pool 1]
// 같은 서비스를 여러 개 동시에 부르면(--pool 4) Linear가 오류 응답을 돌려줘 결과가 비어 보인다. 서비스 하나는 --pool 1로 돌린다.
// 결과(할 일 원문, 자료 제목)는 개인 자료라 저장소에 넣지 않는다. --out은 저장소 밖에 둔다.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { MCP_SERVICES, allowedTools, collectManyRequest, collectRequest, toolPrefix, type McpSource } from "../src/shared/mcp.ts";
import { splitWords } from "../src/shared/shape.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dataPath = arg("--data") ?? join(homedir(), "Library/Application Support/todoBAN/data.json");
const outDir = arg("--out");
if (!outDir) throw new Error("--out <결과 폴더>가 필요해요(저장소 밖)");
mkdirSync(outDir, { recursive: true });
const sources = (arg("--sources") ?? "notion,linear").split(",") as McpSource[];
const limit = Number(arg("--limit") ?? 999);
const POOL = Number(arg("--pool") ?? 4);

const claudePath = [join(homedir(), ".local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find((p) => existsSync(p));
if (!claudePath) throw new Error("claude 실행 파일을 찾지 못했어요");
const env = { ...process.env, PATH: ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local/bin"), process.env.PATH].join(":") };
// A는 앱 규칙 파일이 있는 폴더, B는 규칙 파일이 없는 폴더에서 돌린다(앱 규칙이 기준선 판단에 끼지 않게).
const appDir = mkdtempSync(join(tmpdir(), "rgl9-app-"));
copyFileSync(new URL("../resources/claude/CLAUDE.md", import.meta.url), join(appDir, "CLAUDE.md"));
const judgeDir = mkdtempSync(join(tmpdir(), "rgl9-judge-"));
const today = new Date().toISOString().slice(0, 10);

interface Todo { id: string; title: string; rawText: string; dueDate: string | null; completedAt: string | null }
const data = JSON.parse(readFileSync(dataPath, "utf8")) as { todos: Todo[] };
const todos = data.todos.slice(0, limit);

type Line = Record<string, any>;
function runClaude(cwd: string, args: string[], body: string, timeoutMs: number): Promise<{ ms: number; lines: Line[]; timedOut: boolean }> {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(claudePath!, args, { cwd, env });
    let out = "";
    let timedOut = false;
    const timer = setTimeout(() => ((timedOut = true), child.kill("SIGTERM")), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => {
      clearTimeout(timer);
      const lines = out
        .split("\n")
        .filter((l) => l.startsWith("{"))
        .flatMap((l) => {
          try {
            return [JSON.parse(l)];
          } catch {
            return [];
          }
        });
      resolve({ ms: Math.round(performance.now() - started), lines, timedOut });
    });
    child.stdin.end(body);
  });
}

// 앱(src/main/tools/mcp.ts collectArgs)과 같은 옵션
const appArgs = (source: McpSource) => ["-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--setting-sources", "user,project", "--tools", "ToolSearch", "--permission-mode", "dontAsk", "--model", "sonnet", "--allowedTools", ...allowedTools(source, "collect")];
const judgeArgs = (source: McpSource) => ["-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--setting-sources", "user", "--tools", "ToolSearch", "--permission-mode", "dontAsk", "--model", "sonnet", "--allowedTools", ...allowedTools(source, "collect")];

// stream-json에서 도구 호출과 결과를 짝지어 꺼낸다.
function trace(lines: Line[]) {
  const results = new Map<string, string>();
  for (const l of lines.filter((l) => l.type === "user"))
    for (const c of l.message?.content ?? [])
      if (c.type === "tool_result") results.set(c.tool_use_id, typeof c.content === "string" ? c.content : JSON.stringify(c.content));
  return lines
    .filter((l) => l.type === "assistant")
    .flatMap((l) => l.message?.content ?? [])
    .filter((c: Line) => c.type === "tool_use" && !String(c.name).endsWith("ToolSearch"))
    .map((c: Line) => {
      const res = results.get(c.id) ?? "";
      const titles = [...res.matchAll(/\\?"title\\?"\s*:\s*\\?"([^"\\]{1,120})/g)].map((m) => m[1]).slice(0, 10);
      // 결과 첫머리: 진짜 0건({"issues":[]})과 오류·한도 응답을 구분하려고 남긴다
      return { tool: String(c.name).split("__").pop(), input: c.input, resultChars: res.length, resultHead: res.slice(0, 200), resultTitles: titles, error: /error|denied|not allowed|rate|limit exceeded/i.test(res.slice(0, 200)) };
    });
}
const finalJson = (lines: Line[]): any => {
  const r = lines.findLast((l) => l.type === "result");
  const text = String(r?.result ?? "");
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    // 기준선은 JSON 앞에 한 줄을 붙이기도 한다. 첫 { 부터 마지막 } 까지 다시 읽는다.
    try {
      return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch {
      return { _raw: text.slice(0, 2000) };
    }
  }
};

function judgePrompt(source: McpSource, todo: Todo, siblings: Todo[], picked: { label: string; text?: string; url?: string | null } | null): string {
  const name = MCP_SERVICES[source].name;
  const tools = MCP_SERVICES[source].tools.map((t) => toolPrefix(MCP_SERVICES[source].server) + t).join(", ");
  return [
    `너는 평가자다. 사용자가 할 일 앱에 등록한 할 일과 실제로 관련된 자료를 ${name}에서 찾고, 다른 방식이 고른 자료를 평가한다. 읽기만 하고 아무것도 만들거나 고치지 않는다.`,
    `쓸 수 있는 도구: ${tools}. 처음에 ToolSearch로 "select:${tools}"를 한 번 불러 도구를 연다.`,
    `검색어를 여러 가지로 바꿔 최대 8번까지 찾는다(고유명사, 원래 문장의 낱말, 동의어, 영어). 관련 있어 보이는 것은 본문을 최대 3개까지 읽어 확인한다.`,
    ``,
    `오늘: ${today}`,
    `할 일 제목: ${todo.title}`,
    `사용자가 원래 적은 문장: ${todo.rawText}`,
    todo.dueDate ? `마감: ${todo.dueDate}` : ``,
    siblings.length ? `같은 메모에서 나온 다른 할 일: ${siblings.map((s) => s.title).join(" / ")}` : ``,
    ``,
    `관련도 기준: 3 = 바로 이 할 일을 하는 데 쓰는 자료(같은 대상·같은 일), 2 = 같은 프로젝트·주제지만 이 할 일 자체는 아님, 1 = 낱말만 겹치고 다른 일, 0 = 관계없음`,
    `다른 방식이 고른 자료: ${picked ? JSON.stringify({ label: picked.label, text: picked.text?.slice(0, 300), url: picked.url }) : "없음(아무것도 고르지 않음)"}`,
    ``,
    `JSON만 출력한다:`,
    `{"candidates":[{"title":"","url":"" 또는 null,"relevance":0,"why":"한 줄"}],"bestExists":true 또는 false,"pickedRelevance":0~3 또는 null,"pickedWhy":"한 줄","queriesTried":["…"]}`,
    `candidates는 관련도 순 최대 3개. 관련도 2 이상인 자료가 하나도 없으면 bestExists는 false.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

interface Row {
  mode: "single" | "batch";
  source: McpSource;
  todo: { title: string; rawText: string };
  words: string[];
  a: { ms: number; timedOut: boolean; calls: ReturnType<typeof trace>; picked: any; denied: string[] };
  b?: { ms: number; timedOut: boolean; calls: ReturnType<typeof trace>; verdict: any };
}

async function runCase(mode: "single" | "batch", source: McpSource, todo: Todo, group: Todo[]): Promise<Row> {
  // 앱과 같은 낱말: 첫 행동 만들기 기본값과 확인 창 모두 제목 낱말(켜진 것)만 쓴다.
  const words = splitWords(todo.title, todo.title).filter((w) => w.on).map((w) => w.word);
  let body: string;
  if (mode === "single") body = collectRequest(source, words, today);
  else body = collectManyRequest(source, group.map((t, i) => ({ key: `t${i}`, title: t.title, words: splitWords(t.title, t.title).filter((w) => w.on).map((w) => w.word) })), today);
  const a = await runClaude(appDir, appArgs(source), body, mode === "single" ? 30_000 : 60_000);
  const result = finalJson(a.lines);
  const key = `t${group.indexOf(todo)}`;
  const picked = mode === "single" ? (result.items?.[0] ?? null) : (result.items?.find((x: any) => x.key === key) ?? null);
  const denied = (a.lines.findLast((l) => l.type === "result")?.permission_denials ?? []).map((d: Line) => String(d.tool_name).split("__").pop());
  const row: Row = { mode, source, todo: { title: todo.title, rawText: todo.rawText }, words, a: { ms: a.ms, timedOut: a.timedOut, calls: trace(a.lines), picked, denied } };
  const siblings = group.filter((t) => t !== todo);
  const b = await runClaude(judgeDir, judgeArgs(source), judgePrompt(source, todo, siblings, picked), 180_000);
  row.b = { ms: b.ms, timedOut: b.timedOut, calls: trace(b.lines), verdict: finalJson(b.lines) };
  return row;
}

// 같은 원문(메모)에서 나뉜 할 일끼리 묶는다. 두 개 이상이면 확인 창처럼 한 번에 찾는 경우도 돌린다.
const groups = new Map<string, Todo[]>();
for (const t of todos) groups.set(t.rawText, [...(groups.get(t.rawText) ?? []), t]);
const jobs: (() => Promise<Row>)[] = [];
for (const source of sources) {
  for (const t of todos) jobs.push(() => runCase("single", source, t, [t]));
  for (const g of groups.values()) if (g.length > 1) for (const t of g) jobs.push(() => runCase("batch", source, t, g));
}

const rows: Row[] = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const i = next++;
    const r = await jobs[i]!();
    rows.push(r);
    const v = r.b?.verdict ?? {};
    console.log(
      `[${rows.length}/${jobs.length}] ${r.source.padEnd(6)} ${r.mode.padEnd(6)} ${r.todo.title.slice(0, 24).padEnd(24)} A ${(r.a.ms / 1000).toFixed(0)}s ${r.a.picked ? "→ " + String(r.a.picked.label).slice(0, 30) : "→ 없음"} | B 고른 것 관련도 ${v.pickedRelevance ?? "-"} · 더 맞는 자료 ${v.bestExists ? "있음" : "없음"}`,
    );
    writeFileSync(join(outDir!, "rows.json"), JSON.stringify(rows, null, 2));
  }
}
await Promise.all(Array.from({ length: POOL }, worker));
console.log(`끝: ${rows.length}건 → ${join(outDir, "rows.json")}`);
