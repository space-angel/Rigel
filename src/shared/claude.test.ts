import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaudeError, SplitResult, matchShortcutId, parseClaudeOutput, splitRequest } from "./claude.ts";

const ok = (result: string) => JSON.stringify({ type: "result", is_error: false, result });
const task = { title: "포폴 장표 고치기", plannedDate: "2026-10-21", isClear: true, shortcut: "포폴" };

function kindOf(fn: () => unknown): string {
  try {
    fn();
    return "none";
  } catch (e) {
    return e instanceof ClaudeError ? e.kind : "other";
  }
}

test("result 안의 JSON을 파싱한다", () => {
  const r = parseClaudeOutput(ok(JSON.stringify({ tasks: [task] })), "", SplitResult);
  assert.equal(r.tasks[0]!.title, "포폴 장표 고치기");
});

test("코드 블록 표시가 있어도 파싱한다", () => {
  const r = parseClaudeOutput(ok("```json\n" + JSON.stringify({ tasks: [task] }) + "\n```"), "", SplitResult);
  assert.equal(r.tasks.length, 1);
});

test("형식이 틀리면 parseFailed", () => {
  assert.equal(kindOf(() => parseClaudeOutput(ok("할 일을 나눠 봤어요!"), "", SplitResult)), "parseFailed");
  assert.equal(kindOf(() => parseClaudeOutput(ok(JSON.stringify({ tasks: [] })), "", SplitResult)), "parseFailed");
  assert.equal(kindOf(() => parseClaudeOutput(ok(JSON.stringify({ tasks: [{ title: "x" }] })), "", SplitResult)), "parseFailed");
});

test("로그인 안내가 오면 notLoggedIn", () => {
  const out = JSON.stringify({ is_error: true, result: "Invalid API key · Please run /login" });
  assert.equal(kindOf(() => parseClaudeOutput(out, "", SplitResult)), "notLoggedIn");
  assert.equal(kindOf(() => parseClaudeOutput("", "Not logged in. Please run claude to log in.", SplitResult)), "notLoggedIn");
});

test("그 밖의 오류는 failed", () => {
  assert.equal(kindOf(() => parseClaudeOutput(JSON.stringify({ is_error: true, result: "rate limited" }), "", SplitResult)), "failed");
  assert.equal(kindOf(() => parseClaudeOutput("", "", SplitResult)), "failed");
});

test("요청 본문에는 바로가기 링크를 넣지 않는다", () => {
  const body = JSON.parse(
    splitRequest("포폴 고치기", "2026-10-20", [{ id: "1", name: "포폴", keywords: ["포폴"], url: "https://figma.com/x", appBundleId: null }]),
  );
  assert.deepEqual(body.shortcuts, [{ name: "포폴", keywords: ["포폴"] }]);
  assert.equal(JSON.stringify(body).includes("figma.com"), false);
});

test("목록에 없는 바로가기 이름은 연결하지 않는다", () => {
  const list = [{ id: "a", name: "포폴", keywords: [], url: "", appBundleId: null }];
  assert.equal(matchShortcutId("포폴", list), "a");
  assert.equal(matchShortcutId("사일로", list), null);
  assert.equal(matchShortcutId(null, list), null);
});
