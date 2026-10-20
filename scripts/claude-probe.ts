// 0단계: 앱이 claude -p 를 실행했을 때 응답이 오는지, 몇 초 걸리는지 잰다.
// 실행: node scripts/claude-probe.ts [--runs 1]
import { spawn } from "node:child_process";
import { mkdtempSync, copyFileSync, existsSync } from "node:fs";
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

const workDir = mkdtempSync(join(tmpdir(), "todoban-claude-"));
copyFileSync(new URL("../resources/claude/CLAUDE.md", import.meta.url), join(workDir, "CLAUDE.md"));

const env = {
  ...process.env,
  PATH: ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local/bin"), process.env.PATH].join(":"),
};

const today = new Date().toISOString().slice(0, 10);
const shortcuts = [
  { name: "포폴", keywords: ["포폴", "포트폴리오", "덱"] },
  { name: "사일로", keywords: ["사일로", "발표"] },
];
const SENTENCES = [
  "내일 포폴 올리브영 장표 지표 문장 고치고 사일로 발표 자료 봐야 함. 면접 준비도 해야 되고 이력서 PDF는 나중에 다시 뽑기",
  "오늘 우테크 과제 README 마무리하고 금요일까지 토스 PO 공고 질문 답변 쓰기, 언젠가 포트폴리오 사이트 도메인도 알아보기",
  "운동 루틴 다시 짜야 하는데 일단 이번 주는 포폴 덱 3번 장표부터",
];

const BASE = ["-p", "--output-format", "json", "--tools", ""];
const MIN = [...BASE, "--setting-sources", "project", "--no-session-persistence"];
const CONDITIONS: Record<string, string[]> = {
  "A 기본": BASE,
  "B 설정 최소화": MIN,
  "C B + sonnet": [...MIN, "--model", "sonnet"],
  "D B + haiku": [...MIN, "--model", "haiku"],
};

const TIMEOUT_MS = 60_000;

function runClaude(args: string[], body: string): Promise<{ ms: number; stdout: string; stderr: string; code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(claudePath!, args, { cwd: workDir, env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ms: performance.now() - started, stdout, stderr, code, timedOut });
    });
    child.stdin.end(body);
  });
}

// CLI 응답의 result 문자열을 꺼내, 앞뒤 코드 블록 표시를 지운 뒤 JSON으로 파싱한다.
function parseResult(stdout: string): { tasks?: unknown[]; isError: boolean; raw: string } {
  const outer = JSON.parse(stdout);
  const raw = String(outer.result ?? "");
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return { ...JSON.parse(cleaned), isError: Boolean(outer.is_error), raw };
}

const runs = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 1;
const rows: string[] = [];
console.log(`claude: ${claudePath}\nworkDir: ${workDir}\n`);

for (const [label, args] of Object.entries(CONDITIONS)) {
  const times: number[] = [];
  for (let r = 0; r < runs; r++) {
    for (const [i, text] of SENTENCES.entries()) {
      const body = JSON.stringify({ type: "split", today, text, shortcuts });
      const res = await runClaude(args, body);
      const sec = (res.ms / 1000).toFixed(1);
      if (res.timedOut) {
        console.log(`${label} #${i + 1}: 시간 초과 (${sec}s)`);
        continue;
      }
      try {
        const parsed = parseResult(res.stdout);
        times.push(res.ms);
        console.log(`${label} #${i + 1}: ${sec}s · 할 일 ${parsed.tasks?.length ?? 0}개 · ${JSON.stringify(parsed.tasks)}`);
      } catch (e) {
        console.log(`${label} #${i + 1}: 파싱 실패 (${sec}s, code ${res.code}) ${res.stdout.slice(0, 300)} ${res.stderr.slice(0, 300)}`);
      }
    }
  }
  const avg = times.length ? (times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1) : "-";
  const max = times.length ? (Math.max(...times) / 1000).toFixed(1) : "-";
  rows.push(`| ${label} | ${times.length}/${SENTENCES.length * runs} | ${avg}s | ${max}s |`);
}

console.log("\n| 조건 | 성공 | 평균 | 최대 |\n|---|---|---|---|\n" + rows.join("\n"));
