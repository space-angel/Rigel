import type { z } from "zod";
import { ClaudeError, parseClaudeOutput } from "@shared/claude";
import { ensureWorkDir, findClaude } from "./setup";
import { claudeEnv, killClaude, spawnClaude } from "./paths";

// 개발 중 오류 화면 확인용으로만 TODOBAN_CLAUDE_TIMEOUT_MS로 줄일 수 있다.
export const CLAUDE_TIMEOUT_MS = Number(process.env.TODOBAN_CLAUDE_TIMEOUT_MS) || 60_000;

// 0단계 측정으로 정한 옵션. --bare는 구독 로그인(OAuth)을 읽지 않아서 쓰지 않는다.
function claudeArgs(model: string | null): string[] {
  const args = ["-p", "--output-format", "json", "--tools", "", "--setting-sources", "project", "--no-session-persistence"];
  if (model) args.push("--model", model);
  return args;
}

export interface RunOptions {
  configuredPath: string | null;
  model: string | null;
  signal?: AbortSignal;
}

// 요청 본문은 인자가 아니라 표준 입력으로 보내서, 따옴표나 줄바꿈 때문에 명령이 깨지지 않게 한다.
export async function runClaude<T>(body: string, schema: z.ZodType<T>, opts: RunOptions): Promise<T> {
  const { path } = await findClaude(opts.configuredPath);
  if (!path) throw new ClaudeError("notFound", "claude 실행 파일을 찾지 못했어요");
  const cwd = ensureWorkDir();
  const env = claudeEnv();

  const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawnClaude(path, claudeArgs(opts.model), { cwd, env });
    let out = "";
    let err = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const timer = setTimeout(() => {
      killClaude(child);
      finish(() => reject(new ClaudeError("timeout", `${CLAUDE_TIMEOUT_MS / 1000}초 안에 응답이 없었어요`)));
    }, CLAUDE_TIMEOUT_MS);
    const onAbort = () => {
      killClaude(child);
      finish(() => reject(new ClaudeError("failed", "취소했어요")));
    };
    opts.signal?.addEventListener("abort", onAbort);
    child.stdout!.on("data", (d) => (out += d));
    child.stderr!.on("data", (d) => (err += d));
    child.on("error", (e) => finish(() => reject(new ClaudeError("notFound", e.message))));
    child.on("close", () => finish(() => resolve({ stdout: out, stderr: err })));
    child.stdin!.on("error", () => {}); // 프로세스가 바로 끝나면 stdin 쓰기가 실패할 수 있다. close에서 처리한다.
    child.stdin!.end(body);
  });

  return parseClaudeOutput(stdout, stderr, schema);
}
