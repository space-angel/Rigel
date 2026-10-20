import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyQuickInput, firstLine, matchShortcutByKeywords } from "./quickInput.ts";

test("빈 입력", () => {
  assert.equal(classifyQuickInput("   \n "), "empty");
});

test("한 줄 30자 이하는 바로 넣는다", () => {
  assert.equal(classifyQuickInput("사일로 회고 글 쓰기"), "short");
  assert.equal(classifyQuickInput("가".repeat(30)), "short");
});

test("30자를 넘거나 여러 줄이면 나눈다", () => {
  assert.equal(classifyQuickInput("가".repeat(31)), "long");
  assert.equal(classifyQuickInput("포폴 고치기\n면접 준비"), "long");
});

test("앞뒤 공백은 글자 수에 넣지 않는다", () => {
  assert.equal(classifyQuickInput(`  ${"가".repeat(30)}  `), "short");
});

test("첫 줄", () => {
  assert.equal(firstLine("\n  내일 포폴 고치기 \n면접 준비"), "내일 포폴 고치기");
});

test("짧은 입력은 부르는 말로 바로가기를 연결한다", () => {
  const list = [
    { id: "p", name: "포폴", keywords: ["포폴", "포트폴리오", "덱"] },
    { id: "s", name: "사일로", keywords: ["사일로", "발표"] },
  ];
  assert.equal(matchShortcutByKeywords("포폴 장표 고쳐야 함", list), "p");
  assert.equal(matchShortcutByKeywords("사일로 회고 글 쓰기", list), "s");
  assert.equal(matchShortcutByKeywords("운동 가기", list), null);
});
