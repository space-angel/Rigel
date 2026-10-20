import { app } from "electron";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// 예전에 앱에 들어 있던 CLAUDE.md들의 해시(git 기록). 확인용 파일(.bundled-sha256)이 생기기 전에 만든 폴더는
// 사용자가 고친 파일로 잘못 보여 영영 갱신되지 않았다. 예전 기본값과 똑같으면 고치지 않은 것으로 본다.
// CLAUDE.md를 바꿔 커밋할 때마다 이전 버전의 해시를 여기에 더한다.
const PREVIOUS_BUNDLED = new Set([
  "dac4f097d28420f977a3c159d2c890610c1f7b16569d783b8974b3940e61c43a", // 0e09e28 0단계
  "45f5020175bd0780f0a69fd0d44ca6b6511cb985eed1bb9441bf70ba208f0113", // 33f1cb1 4단계
  "6b6695a0bf6160bb9710b4ef501a297e00680663fd88326769c8b42a262a763e", // e18897d 7-b
  "633916a1e84a85558155038156b3002909c2bb17545b2d9cc8e60b254108fe41", // 69d3816 7-c
  "67bdf26c67bdad70e8e26393cbae37e028f613e071c026c81c8ab925f202cd65", // 1baa55d MCP 매칭
  "89e33fe5d067f01b31cbfd6d57026f8d1abf08ebbd430069c7b74934798511aa", // 18a5af4 collectMany
]);

// 앱 기능이 기대하는 요청 종류. 사용자가 고친 CLAUDE.md에 이 중 하나라도 없으면 그 기능이 동작하지 않는다.
const REQUIRED_TYPES = ["split", "firstStep", "collect", "collectMany", "whoami"];

// 모든 호출은 이 폴더에서 실행해서, Claude Code가 매번 같은 CLAUDE.md 규칙을 읽게 한다.
// 앱에 든 규칙이 바뀌면 새 규칙으로 바꾸되, 사용자가 고쳐 쓴 파일은 덮어쓰지 않는다.
// 마지막으로 복사한 내용의 해시를 옆에 적어 두고, 지금 파일이 그 해시와 같을 때만 바꾼다.
export function ensureWorkDir(): string {
  const dir = join(app.getPath("userData"), "claude");
  mkdirSync(dir, { recursive: true });
  const rules = join(dir, "CLAUDE.md");
  const marker = join(dir, ".bundled-sha256");
  const bundled = readFileSync(resourcePath("claude", "CLAUDE.md"), "utf8");
  const current = existsSync(rules) ? readFileSync(rules, "utf8") : null;
  const lastCopied = existsSync(marker) ? readFileSync(marker, "utf8").trim() : null;
  const untouched = current === null || sha(current) === lastCopied || PREVIOUS_BUNDLED.has(sha(current));
  if (untouched && current !== bundled) {
    writeFileSync(rules, bundled);
    writeFileSync(marker, sha(bundled));
  } else if (current !== null && lastCopied === null && current === bundled) {
    writeFileSync(marker, sha(bundled));
  }
  return dir;
}

export function claudeVersion(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: [...EXTRA_PATHS, process.env.PATH ?? ""].join(":") };
    execFile(path, ["--version"], { timeout: 10_000, env }, (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

// 설정 화면용: 규칙 파일을 사용자가 고쳤는지, 고친 파일에 앱 기능 규칙이 빠졌는지
export function rulesStatus(): { customized: boolean; missing: string[] } {
  const dir = ensureWorkDir();
  const current = readFileSync(join(dir, "CLAUDE.md"), "utf8");
  const bundled = readFileSync(resourcePath("claude", "CLAUDE.md"), "utf8");
  return { customized: current !== bundled, missing: REQUIRED_TYPES.filter((t) => !current.includes(`## type: ${t}`)) };
}

// 기본값으로 되돌린다. 고친 내용은 옆에 CLAUDE.custom-<시각>.md로 남겨 둔다.
export function resetRules(): void {
  const dir = ensureWorkDir();
  const rules = join(dir, "CLAUDE.md");
  const bundled = readFileSync(resourcePath("claude", "CLAUDE.md"), "utf8");
  if (existsSync(rules)) writeFileSync(join(dir, `CLAUDE.custom-${Date.now()}.md`), readFileSync(rules, "utf8"));
  writeFileSync(rules, bundled);
  writeFileSync(join(dir, ".bundled-sha256"), sha(bundled));
}
