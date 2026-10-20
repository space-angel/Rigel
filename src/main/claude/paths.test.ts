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
