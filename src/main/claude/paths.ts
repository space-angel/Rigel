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
// nodeVersions: nvm으로 깐 노드 버전 폴더 이름들(최신이 앞). 버전마다 npm 전역 claude가 따로 있다.
export function claudeCandidates(
  platform: string = process.platform,
  home: string = homedir(),
  env: Env = process.env,
  nodeVersions: string[] = [],
): string[] {
  if (platform === "win32") {
    const p = path.win32;
    const [local, npm] = extraPaths(platform, home, env);
    return [
      p.join(local!, "claude.exe"), // 공식 설치 프로그램
      p.join(npm!, "claude.cmd"), // npm install -g
      p.join(home, ".claude", "local", "claude.exe"),
      p.join(env.ProgramFiles ?? "C:\\Program Files", "nodejs", "claude.cmd"), // nvm-windows·전역 prefix를 노드 폴더로 둔 경우
      p.join(home, ".bun", "bin", "claude.exe"),
      p.join(home, ".volta", "bin", "claude.exe"),
    ];
  }
  const p = path.posix;
  return [
    p.join(home, ".local/bin/claude"), // 공식 설치 스크립트
    "/opt/homebrew/bin/claude", // Homebrew(애플 실리콘)
    "/usr/local/bin/claude", // Homebrew(인텔)·npm 기본 prefix
    p.join(home, ".claude/local/claude"),
    ...nodeVersions.map((v) => p.join(home, ".nvm/versions/node", v, "bin/claude")), // nvm
    p.join(home, ".volta/bin/claude"),
    p.join(home, ".npm-global/bin/claude"), // npm prefix를 홈으로 바꾼 경우
    p.join(home, ".bun/bin/claude"),
    p.join(home, "Library/pnpm/claude"),
    p.join(home, ".local/share/pnpm/claude"),
    p.join(home, ".asdf/shims/claude"),
    p.join(home, ".local/share/mise/shims/claude"),
    "/usr/bin/claude",
  ];
}

// nvm 버전 폴더 이름을 최신부터(v22.11.0 > v20.18.1 > v9.0.0)
export function sortNodeVersions(names: string[]): string[] {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map((n) => Number(n) || 0);
  return names
    .filter((n) => /^v?\d+\.\d+/.test(n))
    .sort((a, b) => {
      const x = parse(a), y = parse(b);
      for (let i = 0; i < 3; i++) if ((y[i] ?? 0) !== (x[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
      return 0;
    });
}

// 셸에 물어볼 명령. 사용자의 기본 셸(SHELL)을 쓴다: zsh·bash는 로그인 셸(-l)로 먼저, 안 되면 대화형(-i)으로.
// nvm 같은 PATH 설정은 대화형 설정 파일(.zshrc·.bashrc)에만 있는 경우가 많다. fish는 문법이 같아서 그대로 된다.
export function shellLookups(platform: string = process.platform, shell: string | undefined = process.env.SHELL): [string, string[]][] {
  if (platform === "win32") return [["where.exe", ["claude"]]];
  const sh = shell && /\/(zsh|bash|fish|sh)$/.test(shell) ? shell : "/bin/zsh";
  return [
    [sh, ["-lc", "command -v claude"]],
    [sh, ["-ic", "command -v claude"]],
  ];
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

// npm·nvm으로 깐 claude는 Node 스크립트라 같은 폴더의 node를 찾아야 한다. claude가 있는 폴더를 PATH 맨 앞에 둔다.
export function envWithDir(env: Env, file: string, platform: string = process.platform): Env {
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const lib = platform === "win32" ? path.win32 : path.posix;
  const dir = lib.dirname(file);
  const delimiter = platform === "win32" ? ";" : ":";
  const current = env[key] ?? "";
  if (current.split(delimiter).includes(dir)) return env;
  return { ...env, [key]: current ? `${dir}${delimiter}${current}` : dir };
}

export function spawnClaude(file: string, args: string[], opts: SpawnOptions = {}): ChildProcess {
  const env = envWithDir((opts.env ?? process.env) as Env, file);
  if (needsShell(file)) return spawn(quoteForCmd(file), args.map(quoteForCmd), { ...opts, env, shell: true, windowsHide: true });
  return spawn(file, args, { ...opts, env, windowsHide: true });
}

// 멈추기: 윈도우에서 셸로 띄운 claude는 셸만 끄면 claude가 남는다. 프로세스 묶음 전체를 끈다.
export function killClaude(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }).on("error", () => child.kill());
    return;
  }
  child.kill("SIGTERM");
}
