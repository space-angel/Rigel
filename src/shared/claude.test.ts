import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaudeError, FirstStepResult, SplitResult, firstStepRequest, matchShortcutId, otherTasks, parseClaudeOutput, splitRequest } from "./claude.ts";

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
  assert.equal(kindOf(() => parseClaudeOutput(JSON.stringify({ is_error: true, result: "unexpected tool state" }), "", SplitResult)), "failed");
  // 요청·사용량 한도는 따로 알린다(usageLimit)
  assert.equal(kindOf(() => parseClaudeOutput(JSON.stringify({ is_error: true, result: "rate limited" }), "", SplitResult)), "usageLimit");
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

test("firstStep 결과: 첫 행동 또는 질문", () => {
  const a = parseClaudeOutput(ok(JSON.stringify({ title: "공고 질문 답변 쓰기", question: null, shortcut: null })), "", FirstStepResult);
  assert.equal(a.title, "공고 질문 답변 쓰기");
  const q = parseClaudeOutput(ok(JSON.stringify({ title: null, question: "어느 회사 면접인가요?", shortcut: null })), "", FirstStepResult);
  assert.equal(q.question, "어느 회사 면접인가요?");
  assert.equal(kindOf(() => parseClaudeOutput(ok(JSON.stringify({ title: null, question: null })), "", FirstStepResult)), "parseFailed");
});

test("firstStep 요청 본문에 이전 제안과 답을 넣는다", () => {
  const body = JSON.parse(firstStepRequest({ title: "면접 준비", rawText: "면접 준비", answer: "토스 PO", previous: ["a"] }, "2026-10-20", []));
  assert.equal(body.type, "firstStep");
  assert.equal(body.answer, "토스 PO");
  assert.deepEqual(body.previous, ["a"]);
});

test("첫 행동 요청에 같은 목록의 다른 할 일을 넣는다: 끝내지 않은 것, 같은 메모에서 나뉜 것부터", () => {
  const memo = "목요일까지 케이스 스터디 정리하고 케이스 하나 더";
  const todo = { id: "a", title: "케이스 하나 더 만들기", dueDate: null, rawText: memo, completedAt: null, order: 3 };
  const todos = [
    todo,
    { id: "b", title: "포폴 표지 고치기", dueDate: null, rawText: "포폴 표지 고치기", completedAt: null, order: 1 },
    { id: "c", title: "끝낸 일", dueDate: null, rawText: "끝낸 일", completedAt: "2026-10-20T01:00:00Z", order: 2 },
    { id: "d", title: "케이스 스터디 정리하기", dueDate: "2026-10-22", rawText: memo, completedAt: null, order: 4 },
  ];
  const others = otherTasks(todo, todos);
  assert.deepEqual(others, [
    { title: "케이스 스터디 정리하기", dueDate: "2026-10-22", rawText: "", sameNote: true },
    { title: "포폴 표지 고치기", dueDate: null, rawText: "" },
  ]);
  const body = JSON.parse(firstStepRequest({ title: todo.title, rawText: memo, answer: null, previous: [], others }, "2026-10-20", []));
  assert.equal(body.others.length, 2);
  // 다른 할 일이 없으면 넣지 않는다
  assert.equal("others" in JSON.parse(firstStepRequest({ title: "x", rawText: "x", answer: null, previous: [], others: [] }, "2026-10-20", [])), false);
});

test("다른 사람이 처음 쓸 때의 실패를 종류로 나눈다", async () => {
  const { readFileSync } = await import("node:fs");
  const real = readFileSync(new URL("../../docs/qa/fixtures/claude-outputs/not-logged-in.json", import.meta.url), "utf8");
  // 실제 claude 2.1.304가 로그인 안 된 홈 폴더에서 돌려준 출력
  assert.equal(kindOf(() => parseClaudeOutput(real, "", FirstStepResult)), "notLoggedIn");
  const err = (result: string) => JSON.stringify({ type: "result", subtype: "success", is_error: true, result });
  assert.equal(kindOf(() => parseClaudeOutput(err("OAuth token has expired. Please obtain a new token or refresh your existing token."), "", FirstStepResult)), "notLoggedIn");
  assert.equal(kindOf(() => parseClaudeOutput(err("Claude AI usage limit reached|1893456000"), "", FirstStepResult)), "usageLimit");
  assert.equal(kindOf(() => parseClaudeOutput(err("5-hour limit reached ∙ resets 3pm"), "", FirstStepResult)), "usageLimit");
  assert.equal(kindOf(() => parseClaudeOutput(err("Credit balance is too low"), "", FirstStepResult)), "usageLimit");
  assert.equal(kindOf(() => parseClaudeOutput(err("API Error: Connection error."), "", FirstStepResult)), "network");
  assert.equal(kindOf(() => parseClaudeOutput("", "getaddrinfo ENOTFOUND api.anthropic.com", FirstStepResult)), "network");
  assert.equal(kindOf(() => parseClaudeOutput(err("Something else broke"), "", FirstStepResult)), "failed");
  assert.equal(kindOf(() => parseClaudeOutput("", "error: unknown option '--setting-sources'", FirstStepResult)), "outdated");
});

test("한도 문구에서 다시 쓸 수 있는 때를 꺼낸다", async () => {
  const { limitReset } = await import("./claude.ts");
  assert.equal(limitReset("5-hour limit reached ∙ resets 3pm"), "3pm");
  assert.equal(limitReset("You've hit your limit · resets 7:30pm (Asia/Seoul)"), "7:30pm");
  assert.match(limitReset("Claude AI usage limit reached|1893456000", new Date("2026-10-21T00:00:00Z")) ?? "", /^\d{2}:\d{2}$/);
  assert.equal(limitReset("limit reached"), null);
});
