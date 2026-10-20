import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyQuickInput, firstLine } from "./quickInput.ts";

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
