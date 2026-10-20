import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

// claude가 깔리는 자리와, 앱에서 claude를 실행할 때의 PATH. 앱은 터미널의 PATH를 읽지 않으므로 직접 보강한다.
// 플랫폼을 인자로 받아 맥에서도 윈도우 규칙을 시험할 수 있게 한다.
type Env = Record<string, string | undefined>;

export function extraPaths(platform: string = process.platform, home: string = homedir(), env: Env = process.env): string[] {
  if (platform === "win32") {
    const p = path.win32;
    return [
      p.join(home, ".local", "bin"), // 공식 설치 프로그램(native)
      env.APPDATA ? p.join(env.APPDATA, "npm") : p.join(home, "AppData", "Roaming", "npm"), // npm install -g
      env.LOCALAPPDATA ? p.join(env.LOCALAPPDATA, "Programs", "claude") : null,
    ].filter((x): x is string => Boolean(x));
  }
  return ["/opt/homebrew/bin", "/usr/local/bin", path.posix.join(home, ".local/bin")];
}

// 정해 둔 자리에서 먼저 찾는다(앞쪽이 우선).
export function claudeCandidates(platform: string = process.platform, home: string = homedir(), env: Env = process.env): string[] {
  if (platform === "win32") {
    const [local, npm] = extraPaths(platform, home, env);
    return [path.win32.join(local!, "claude.exe"), path.win32.join(npm!, "claude.cmd"), path.win32.join(home, ".claude", "local", "claude.exe")];
  }
  return [path.posix.join(home, ".local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude", path.posix.join(home, ".claude/local/claude")];
}

// claude를 실행할 환경. 윈도우의 환경 변수 이름은 대소문자를 가리지 않아 PATH가 Path로 들어 있을 수 있다.
export function claudeEnv(platform: string = process.platform, env: Env = process.env, home: string = homedir()): Env {
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const delimiter = platform === "win32" ? ";" : ":";
  const out: Env = { ...env };
  out[key] = [...extraPaths(platform, home, env), env[key] ?? ""].join(delimiter);
  return out;
}

// cmd.exe에 넘길 때 인자 하나를 감싼다. 빈 인자("")도 살아 있어야 한다(--tools "").
export function quoteForCmd(arg: string): string {
  return `"${arg.replace(/"/g, '""')}"`;
}

// npm으로 깐 claude.cmd는 셸을 거쳐야 실행된다(Node가 .cmd를 바로 실행하지 않음). 그 밖에는 그대로 실행한다.
export function needsShell(file: string, platform: string = process.platform): boolean {
  return platform === "win32" && /\.(cmd|bat)$/i.test(file);
}

export function spawnClaude(file: string, args: string[], opts: SpawnOptions = {}): ChildProcess {
  if (needsShell(file)) return spawn(quoteForCmd(file), args.map(quoteForCmd), { ...opts, shell: true, windowsHide: true });
  return spawn(file, args, { ...opts, windowsHide: true });
}

// 멈추기: 윈도우에서 셸로 띄운 claude는 셸만 끄면 claude가 남는다. 프로세스 묶음 전체를 끈다.
export function killClaude(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }).on("error", () => child.kill());
    return;
  }
  child.kill("SIGTERM");
}
