// Notion collect 벤치: 정답이 있는 문제로 규칙·모델 조합을 비교한다. 시간, 부른 도구 수, 맞힘 여부를 잰다.
// 정답은 이 워크스페이스(Wozz)에 실제로 있는 페이지 제목이다.
// 실행: node scripts/notion-bench.ts [--configs A,B,C] [--out docs/qa/notion-bench.json]
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { allowedTools, collectRequest } from "../src/shared/mcp.ts";

const claudePath = [join(homedir(), ".local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find((p) => existsSync(p));
if (!claudePath) throw new Error("claude 실행 파일을 찾지 못했어요");
const env = { ...process.env, PATH: ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local/bin"), process.env.PATH].join(":") };
const base = readFileSync(new URL("../resources/claude/CLAUDE.md", import.meta.url), "utf8");

// expect: 고른 자료의 label에 이 중 하나가 들어 있으면 맞음. null이면 "없음"이 정답.
interface Case {
  id: string;
  title: string;
  words: string[];
  expect: string[] | null;
  kind: string;
}
export const CASES: Case[] = [
  { id: "c01", title: "면접 답변 다듬기", words: ["면접", "답변"], expect: ["답변 공통 규칙", "모의면접"], kind: "기본" },
  { id: "c02", title: "모의면접 피드백 반영하기", words: ["모의면접", "피드백"], expect: ["모의면접 1회차"], kind: "기본" },
  { id: "c03", title: "포폴 덱 첫 장 고치기", words: ["포폴", "덱"], expect: ["포트폴리오 피드백"], kind: "줄임말" },
  { id: "c04", title: "문토 PO 지원서 쓰기", words: ["문토", "PO", "지원서"], expect: ["문토"], kind: "회사 이름" },
  { id: "c05", title: "엘리스 PM 공고 다시 보기", words: ["엘리스", "공고"], expect: ["엘리스"], kind: "회사 이름" },
  { id: "c06", title: "이력서 v0 초안 점검", words: ["이력서", "초안"], expect: ["커리어코치"], kind: "본문에만 있음" },
  { id: "c07", title: "JD 키워드 정리", words: ["JD", "키워드"], expect: ["JD 키워드 지도"], kind: "기본" },
  { id: "c08", title: "올리브영 리뷰탭 회고 다시 읽기", words: ["올리브영", "리뷰탭", "회고"], expect: ["회고", "파이프라인V4"], kind: "프로젝트" },
  { id: "c09", title: "사령세계 보스 패턴 설계", words: ["사령세계", "보스"], expect: ["사령세계"], kind: "프로젝트" },
  { id: "c10", title: "운동 루틴 짜기", words: ["운동", "루틴"], expect: null, kind: "없어야 정상" },
  { id: "c11", title: "고양이 사료 주문", words: ["고양이", "사료"], expect: null, kind: "없어야 정상" },
  { id: "c12", title: "resume review", words: ["resume", "review"], expect: ["커리어코치", "recruit", "특강", "이력서"], kind: "영어 입력" },
  { id: "c13", title: "면접 준비", words: ["면접", "준비"], expect: ["면접 준비", "모의면접", "답변 공통 규칙", "면접 회고"], kind: "막연함" },
  { id: "c14", title: "포트폴리어 피드백 보기", words: ["포트폴리어", "피드백"], expect: ["포트폴리오 피드백"], kind: "오타" },
  { id: "c15", title: "문토랑 엘리스 공고 비교하기", words: ["문토", "엘리스", "공고"], expect: ["문토", "엘리스"], kind: "두 주제" },
  { id: "c16", title: "카카오 PM 공고 지원하기", words: ["카카오", "PM", "공고"], expect: null, kind: "비슷하지만 없음" },
  { id: "c17", title: "멘토 장수지님 피드백 정리", words: ["멘토", "장수지", "피드백"], expect: ["모의면접 1회차"], kind: "사람 이름" },
  { id: "c18", title: "두잇투게더 백로그 정리", words: ["두잇투게더", "백로그"], expect: ["두잇투게더", "백로그", "패딩", "로고", "로그인", "서치 콘솔"], kind: "프로젝트" },
  { id: "c19", title: "적합도 높은 공고부터 지원", words: ["적합도", "공고", "지원"], expect: ["·"], kind: "막연함(공고 아무거나)" },
  { id: "c20", title: "스프린트 회고 템플릿 쓰기", words: ["스프린트", "회고", "템플릿"], expect: ["스프린트 공유 템플릿"], kind: "기본" },
];

// B: 검색 결과(제목·경로·미리보기)로 바로 고르고 페이지를 따로 열지 않는다. 줄임말과 영어는 원래 말로도 찾는다.
const RULES_B = `
## notion 검색 규칙 (위 collect 규칙보다 우선)
- notion-search는 page_size 8, max_highlight_length 300으로 부른다.
- 검색 결과의 title, path, highlight로 고른다. notion-fetch는 부르지 않는다. text는 highlight로 쓴다.
- 줄임말·영어는 워크스페이스에서 쓰는 원래 말로도 검색한다. 예: 포폴 → 포트폴리오, PO → 프로덕트 오너, resume → 이력서
- 검색어는 낱말 하나. 가장 특이한 낱말(고유명사, 회사·프로젝트 이름)부터. 검색은 최대 3번.
- 고르는 기준: title이나 highlight에 할 일의 핵심 낱말이 실제로 들어 있고, 할 일과 같은 일을 다룬다. 낱말만 겹치고 다른 일이면 고르지 않는다.
`;

// D: B에 더해 마지막 답을 짧게(요약 150자), 검색어가 여럿이면 한 턴에 같이, 도구는 이름으로 바로 불러온다.
const RULES_D = RULES_B + `- 처음 ToolSearch는 query "select:mcp__claude_ai_Notion__notion-search" 로 한 번만 부른다.
- 검색어가 2개 이상 필요하면 같은 턴에 notion-search를 함께 부른다(최대 3개). 결과를 보고 더 필요할 때만 한 번 더.
- 출력은 짧게: label은 페이지 제목 그대로(40자 이내), text는 첫 행동에 쓸 사실만 150자 이내. 설명을 붙이지 않는다.
`;

const CONFIGS: Record<string, { rules: string; model: string; effort?: string }> = {
  A: { rules: base, model: "sonnet" },
  B: { rules: base + RULES_B, model: "sonnet" },
  C: { rules: base + RULES_B, model: "haiku" },
  D: { rules: base + RULES_D, model: "sonnet" },
  E: { rules: base + RULES_D, model: "sonnet", effort: "low" },
};

function workDir(rules: string): string {
  const dir = mkdtempSync(join(tmpdir(), "todoban-bench-"));
  writeFileSync(join(dir, "CLAUDE.md"), rules);
  return dir;
}

function run(dir: string, model: string, c: Case, effort?: string): Promise<{ ms: number; lines: any[]; marks: Record<string, number> }> {
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--setting-sources", "user,project", "--tools", "ToolSearch", "--permission-mode", "dontAsk", "--model", model, ...(effort ? ["--effort", effort] : []), "--allowedTools", ...allowedTools("notion")];
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(claudePath!, args, { cwd: dir, env });
    let out = "";
    // 단계별 시각: 시작 메시지, ToolSearch 호출, 첫 검색 호출, 첫 검색 결과, 마지막 답
    const marks: Record<string, number> = {};
    let seen = 0;
    const timer = setTimeout(() => child.kill("SIGTERM"), 90_000);
    child.stdout.on("data", (d) => {
      out += d;
      const lines = out.split("\n");
      for (; seen < lines.length - 1; seen++) {
        const l = lines[seen]!;
        const t = Math.round(performance.now() - started);
        if (l.includes('"subtype":"init"')) marks.init ??= t;
        else if (l.includes('"name":"ToolSearch"')) marks.toolsearch ??= t;
        else if (l.includes("notion-search") && l.includes('"tool_use"')) marks.search ??= t;
        else if (l.includes('"type":"user"') && marks.search && !marks.searchResult) marks.searchResult = t;
        else if (l.includes('"type":"result"')) marks.result = t;
      }
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve({ ms: performance.now() - started, lines: out.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)), marks });
    });
    child.stdin.end(collectRequest("notion", c.words, new Date().toISOString().slice(0, 10)));
  });
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const configs = (arg("--configs") ?? "A,B,C").split(",");
const only = arg("--cases")?.split(",");
const rows: any[] = [];
const jobs = configs.flatMap((cfg) => CASES.filter((c) => !only || only.includes(c.id)).map((c) => ({ cfg, c, dir: "" })));
const dirs = Object.fromEntries(configs.map((k) => [k, workDir(CONFIGS[k]!.rules)]));

await pool(jobs, 3, async ({ cfg, c }) => {
  const { ms, lines, marks } = await run(dirs[cfg]!, CONFIGS[cfg]!.model, c, CONFIGS[cfg]!.effort);
  const calls = lines
    .filter((l) => l.type === "assistant")
    .flatMap((l) => l.message.content)
    .filter((x: { type: string; name?: string }) => x.type === "tool_use" && !String(x.name).endsWith("ToolSearch"))
    .map((x: { name: string; input: { query?: string } }) => (x.name.endsWith("notion-search") ? `search:${x.input.query}` : "fetch"));
  const result = lines.findLast((l) => l.type === "result");
  let label: string | null = null;
  try {
    const cleaned = String(result?.result ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    label = JSON.parse(cleaned).items?.[0]?.label ?? null;
  } catch {
    label = "(파싱 실패)";
  }
  const correct = c.expect === null ? label === null : label !== null && c.expect.some((e) => label!.includes(e));
  const row = { cfg, id: c.id, kind: c.kind, title: c.title, ms: Math.round(ms), marks, turns: result?.num_turns ?? null, cost: result?.total_cost_usd ?? null, calls, label, correct };
  rows.push(row);
  console.log(`${cfg} ${c.id} ${correct ? "✓" : "✗"} ${(ms / 1000).toFixed(1)}s ${calls.join(" ")} → ${label ?? "없음"}`);
});

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
console.log("\n설정 | 시작 메시지 | ToolSearch 호출 | 첫 검색 호출 | 첫 검색 결과 | 끝 (ms, 평균)");
for (const cfg of configs) {
  const r = rows.filter((x) => x.cfg === cfg);
  const m = (k: string) => mean(r.map((x) => x.marks[k]).filter((v) => v !== undefined));
  console.log(`${cfg} | ${m("init")} | ${m("toolsearch")} | ${m("search")} | ${m("searchResult")} | ${m("result")}`);
}
console.log("\n설정 | 맞힘 | 평균 시간 | 평균 도구 호출");
for (const cfg of configs) {
  const r = rows.filter((x) => x.cfg === cfg);
  const avg = (f: (x: any) => number) => (r.reduce((a, x) => a + f(x), 0) / r.length).toFixed(1);
  console.log(`${cfg} | ${r.filter((x) => x.correct).length}/${r.length} | ${avg((x) => x.ms / 1000)}s | ${avg((x) => x.calls.length)}`);
}
const out = arg("--out");
if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
