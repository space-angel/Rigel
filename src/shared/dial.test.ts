import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dialBuckets, dialRatio } from "./dial.ts";
import type { TodoItem } from "./types.ts";

const today = "2026-10-20";
const t = (id: string, plannedDate: string | null, isClear = true, completedAt: string | null = null): TodoItem => ({
  id,
  title: id,
  plannedDate,
  dueDate: null,
  order: 0,
  completedAt,
  createdAt: "2026-10-19T00:00:00.000Z",
  rawText: id,
  isClear,
  shortcutId: null,
  context: [],
});

test("다이얼 묶음: 끝냄·지남·오늘·내일·나중", () => {
  const todos = [
    t("a", today),
    t("b", today, false),
    t("c", "2026-10-18"),
    t("d", "2026-10-21"),
    t("e", "2026-10-23", false),
    t("f", null),
    t("g", today, true, new Date(2026, 9, 20, 9).toISOString()),
  ];
  const b = dialBuckets(todos, today);
  assert.deepEqual(b.today.map((x) => x.id).sort(), ["a", "b", "c"]);
  assert.deepEqual(b.overdue.map((x) => x.id), ["c"]);
  assert.deepEqual(b.tomorrow.map((x) => x.id), ["d"]);
  assert.deepEqual(b.later.map((x) => x.id).sort(), ["e", "f"]);
  assert.deepEqual(b.done.map((x) => x.id), ["g"]);
});

test("비율: 오늘은 끝냄/바로 시작/첫 행동, 합은 100", () => {
  const todos = [t("a", today), t("b", today), t("c", today, false), t("g", today, true, new Date(2026, 9, 20, 9).toISOString())];
  const r = dialRatio("today", dialBuckets(todos, today));
  assert.deepEqual(r.map((p) => [p.key, p.count]), [["done", 1], ["ready", 2], ["step", 1]]);
  assert.equal(r.reduce((a, p) => a + p.pct, 0), 100);
});

test("비율: 다른 묶음은 정리됨/첫 행동, 빈 칸과 빈 묶음은 뺀다", () => {
  const todos = [t("e", "2026-10-23"), t("f", null), t("h", null, false)];
  const r = dialRatio("later", dialBuckets(todos, today));
  assert.deepEqual(r.map((p) => [p.key, p.pct]), [["planned", 67], ["step", 33]]);
  assert.deepEqual(dialRatio("tomorrow", dialBuckets(todos, today)), []);
  assert.deepEqual(dialRatio("later", dialBuckets([t("f", null)], today)).map((p) => p.key), ["planned"]);
});

test("날짜 더하기는 월을 넘긴다", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
});

test("완료 칸 비율: 오늘 할 일 중 끝낸 몫과 남은 몫", () => {
  const today = "2026-10-21";
  const mk = (id: string, done: boolean): TodoItem => ({ id, title: id, plannedDate: today, dueDate: null, order: 0, completedAt: done ? `${today}T03:00:00.000Z` : null, createdAt: `${today}T01:00:00.000Z`, rawText: id, isClear: true, shortcutId: null, context: [] });
  const r = dialRatio("done", dialBuckets([mk("a", true), mk("b", true), mk("c", false), mk("d", false), mk("e", false)], today));
  assert.deepEqual(r.map((p) => [p.key, p.count, p.pct]), [["done", 2, 40], ["left", 3, 60]]);
});
