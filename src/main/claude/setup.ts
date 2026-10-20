import { app } from "electron";
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// 맥 앱은 터미널의 PATH를 읽지 않는다. 그래서 claude를 직접 찾고, 실행할 때 PATH를 보강한다.
export const EXTRA_PATHS = ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local/bin")];

const CANDIDATES = [
  join(homedir(), ".local/bin/claude"),
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  join(homedir(), ".claude/local/claude"),
];

export function resourcePath(...parts: string[]): string {
  return app.isPackaged ? join(process.resourcesPath, ...parts) : join(__dirname, "../../resources", ...parts);
}

function loginShellLookup(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("/bin/zsh", ["-lc", "command -v claude"], { timeout: 5000 }, (err, stdout) => {
      const p = stdout.trim();
      resolve(!err && p && existsSync(p) ? p : null);
    });
  });
}

export interface ClaudeLookup {
  path: string | null;
  searched: string[];
}

// 1. 설정에서 지정한 경로 2. 정해진 경로들 3. 로그인 셸의 command -v
// 설정에 경로가 있으면 그것만 본다. 사용자가 고른 경로가 틀렸다면 다른 것으로 몰래 바꾸지 않는다.
export async function findClaude(configured: string | null): Promise<ClaudeLookup> {
  const override = process.env.TODOBAN_CLAUDE_PATH ?? configured;
  if (override) return { path: existsSync(override) ? override : null, searched: [override] };
  const found = CANDIDATES.find((p) => existsSync(p));
  if (found) return { path: found, searched: CANDIDATES };
  const viaShell = await loginShellLookup();
  return { path: viaShell, searched: [...CANDIDATES, 'zsh -lc "command -v claude"'] };
}

// 모든 호출은 이 폴더에서 실행해서, Claude Code가 매번 같은 CLAUDE.md 규칙을 읽게 한다.
// 사용자가 고쳐 쓴 규칙을 덮어쓰지 않도록 파일이 없을 때만 만든다.
export function ensureWorkDir(): string {
  const dir = join(app.getPath("userData"), "claude");
  mkdirSync(dir, { recursive: true });
  const rules = join(dir, "CLAUDE.md");
  if (!existsSync(rules)) copyFileSync(resourcePath("claude", "CLAUDE.md"), rules);
  return dir;
}
