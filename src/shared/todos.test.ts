import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, orderBetween, todayView, localDate } from "./todos.ts";
import { emptyData } from "./types.ts";

const now = new Date(2026, 9, 20, 9, 12);
const today = localDate(now);

test("orderBetween은 앞뒤 값의 중간값을 쓴다", () => {
  assert.equal(orderBetween(1, 2), 1.5);
  assert.equal(orderBetween(null, 3), 2);
  assert.equal(orderBetween(3, null), 4);
  assert.equal(orderBetween(null, null), 0);
});

test("추가한 할 일은 오늘 맨 아래, 정리 안 된 할 일로 들어간다", () => {
  let d = emptyData();
  d = applyAction(d, { type: "add", title: "포폴 손보기" }, now);
  d = applyAction(d, { type: "add", title: "면접 준비" }, now);
  const v = todayView(d.todos, today);
  assert.deepEqual(v.open.map((t) => t.title), ["포폴 손보기", "면접 준비"]);
  assert.equal(v.unclearCount, 2);
  assert.equal(v.open[0]!.plannedDate, today);
});

test("빈 제목은 추가하지 않는다", () => {
  const d = applyAction(emptyData(), { type: "add", title: "   " }, now);
  assert.equal(d.todos.length, 0);
});

test("끌어서 순서를 바꾸면 끼운 할 일의 order만 바뀐다", () => {
  let d = emptyData();
  for (const t of ["a", "b", "c"]) d = applyAction(d, { type: "add", title: t }, now);
  const [a, b, c] = todayView(d.todos, today).open;
  d = applyAction(d, { type: "reorder", id: c!.id, beforeId: a!.id, afterId: b!.id }, now);
  const v = todayView(d.todos, today);
  assert.deepEqual(v.open.map((t) => t.title), ["a", "c", "b"]);
  assert.equal(d.todos.find((t) => t.id === a!.id)!.order, a!.order);
  assert.equal(d.todos.find((t) => t.id === b!.id)!.order, b!.order);
});

test("체크하면 끝낸 할 일로, 다시 체크하면 되돌아온다", () => {
  let d = applyAction(emptyData(), { type: "add", title: "x" }, now);
  const id = d.todos[0]!.id;
  d = applyAction(d, { type: "toggle", id }, now);
  assert.equal(todayView(d.todos, today).done.length, 1);
  assert.equal(todayView(d.todos, today).open.length, 0);
  d = applyAction(d, { type: "toggle", id }, now);
  assert.equal(todayView(d.todos, today).open.length, 1);
});

test("나중 할 일을 오늘로 옮기면 오늘 맨 아래로 간다", () => {
  let d = applyAction(emptyData(), { type: "add", title: "오늘 것" }, now);
  d = { ...d, todos: [...d.todos, { ...d.todos[0]!, id: "later", title: "나중 것", plannedDate: null, order: -5 }] };
  assert.equal(todayView(d.todos, today).later.length, 1);
  d = applyAction(d, { type: "moveToToday", id: "later" }, now);
  const v = todayView(d.todos, today);
  assert.deepEqual(v.open.map((t) => t.title), ["오늘 것", "나중 것"]);
  assert.equal(v.later.length, 0);
});

test("할 날짜가 지난 할 일도 오늘 목록에 보인다", () => {
  let d = applyAction(emptyData(), { type: "add", title: "어제 것" }, now);
  d.todos[0]!.plannedDate = "2026-10-19";
  assert.equal(todayView(d.todos, today).open.length, 1);
});
