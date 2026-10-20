import { test } from "node:test";
import assert from "node:assert/strict";
import { claudeCandidates, claudeEnv, extraPaths, needsShell, quoteForCmd } from "./paths.ts";

test("윈도우: 공식 설치(claude.exe)와 npm(claude.cmd) 자리에서 찾는다", () => {
  const env = { APPDATA: "C:\\Users\\kim\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\kim\\AppData\\Local" };
  const c = claudeCandidates("win32", "C:\\Users\\kim", env);
  assert.equal(c[0], "C:\\Users\\kim\\.local\\bin\\claude.exe");
  assert.equal(c[1], "C:\\Users\\kim\\AppData\\Roaming\\npm\\claude.cmd");
});

test("맥: homebrew·~/.local/bin 자리에서 찾는다", () => {
  assert.deepEqual(claudeCandidates("darwin", "/Users/kim").slice(0, 2), ["/Users/kim/.local/bin/claude", "/opt/homebrew/bin/claude"]);
  assert.ok(extraPaths("darwin", "/Users/kim").includes("/opt/homebrew/bin"));
});

test("윈도우 PATH: ; 로 잇고, Path처럼 다른 대소문자 이름을 그대로 쓴다(중복 PATH를 만들지 않는다)", () => {
  const env = claudeEnv("win32", { Path: "C:\\Windows\\system32", APPDATA: "C:\\A" }, "C:\\Users\\kim");
  assert.equal(env.PATH, undefined);
  assert.ok(env.Path!.endsWith(";C:\\Windows\\system32"));
  assert.ok(env.Path!.startsWith("C:\\Users\\kim\\.local\\bin;C:\\A\\npm"));
});

test("맥 PATH는 : 로 잇는다", () => {
  const env = claudeEnv("darwin", { PATH: "/usr/bin" }, "/Users/kim");
  assert.equal(env.PATH, "/opt/homebrew/bin:/usr/local/bin:/Users/kim/.local/bin:/usr/bin");
});

test("claude.cmd는 셸로, 인자는 빈 값과 따옴표까지 살려 감싼다", () => {
  assert.equal(needsShell("C:\\npm\\claude.cmd", "win32"), true);
  assert.equal(needsShell("C:\\bin\\claude.exe", "win32"), false);
  assert.equal(needsShell("/usr/local/bin/claude", "darwin"), false);
  assert.equal(quoteForCmd(""), '""');
  assert.equal(quoteForCmd('say "hi"'), '"say ""hi"""');
});

test("nvm·volta·bun·pnpm 같은 자리도 찾는다. nvm은 최신 노드부터", async () => {
  const { sortNodeVersions } = await import("./paths.ts");
  const v = sortNodeVersions(["v9.0.0", "v22.11.0", "v20.18.1", "system", ".DS_Store"]);
  assert.deepEqual(v, ["v22.11.0", "v20.18.1", "v9.0.0"]);
  const c = claudeCandidates("darwin", "/Users/kim", {}, v);
  assert.ok(c.indexOf("/Users/kim/.nvm/versions/node/v22.11.0/bin/claude") < c.indexOf("/Users/kim/.nvm/versions/node/v20.18.1/bin/claude"));
  for (const p of ["/Users/kim/.volta/bin/claude", "/Users/kim/.bun/bin/claude", "/Users/kim/Library/pnpm/claude", "/Users/kim/.npm-global/bin/claude"]) assert.ok(c.includes(p), p);
  // 공식 설치 자리가 가장 먼저
  assert.equal(c[0], "/Users/kim/.local/bin/claude");
});

test("셸에 물어볼 때는 사용자의 기본 셸로, 로그인 셸 → 대화형 순서", async () => {
  const { shellLookups } = await import("./paths.ts");
  assert.deepEqual(shellLookups("darwin", "/bin/bash"), [["/bin/bash", ["-lc", "command -v claude"]], ["/bin/bash", ["-ic", "command -v claude"]]]);
  assert.equal(shellLookups("darwin", undefined)[0]![0], "/bin/zsh");
  assert.equal(shellLookups("darwin", "/opt/homebrew/bin/fish")[0]![0], "/opt/homebrew/bin/fish");
  assert.deepEqual(shellLookups("win32"), [["where.exe", ["claude"]]]);
});

test("claude가 있는 폴더를 PATH 맨 앞에 둔다(npm으로 깐 claude가 같은 폴더의 node를 찾게)", async () => {
  const { envWithDir } = await import("./paths.ts");
  const mac = envWithDir({ PATH: "/usr/bin" }, "/Users/kim/.nvm/versions/node/v22.11.0/bin/claude", "darwin");
  assert.equal(mac.PATH, "/Users/kim/.nvm/versions/node/v22.11.0/bin:/usr/bin");
  const win = envWithDir({ Path: "C:\\Windows" }, "C:\\Users\\kim\\AppData\\Roaming\\npm\\claude.cmd", "win32");
  assert.equal(win.Path, "C:\\Users\\kim\\AppData\\Roaming\\npm;C:\\Windows");
  // 이미 있으면 그대로
  assert.equal(envWithDir({ PATH: "/a:/b" }, "/b/claude", "darwin").PATH, "/a:/b");
});
