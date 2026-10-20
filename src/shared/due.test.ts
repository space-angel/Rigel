import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, deadlineOptions, dueBadge, dueLabel, readDates } from "./due.ts";

const tue = "2026-10-20"; // 화요일

test("마감: “까지”나 행사 + 준비면 마감은 그날, 할 날짜는 오늘", () => {
  assert.deepEqual(readDates("금요일까지 자소서 쓰기", tue), { plannedDate: tue, dueDate: "2026-10-23" });
  assert.deepEqual(readDates("금요일 면접 준비", tue), { plannedDate: tue, dueDate: "2026-10-23" });
  assert.deepEqual(readDates("목요일 발표 장표 검토", tue), { plannedDate: tue, dueDate: "2026-10-22" });
  assert.deepEqual(readDates("10월 30일까지 과제 제출", tue), { plannedDate: tue, dueDate: "2026-10-30" });
  assert.deepEqual(readDates("11/2 마감 README 쓰기", tue), { plannedDate: tue, dueDate: "2026-11-02" });
});

test("행사 그 자체는 할 날짜·마감 모두 그날 (나누기 규칙과 같게)", () => {
  assert.deepEqual(readDates("금요일 결혼식 가기", tue), { plannedDate: "2026-10-23", dueDate: "2026-10-23" });
  assert.deepEqual(readDates("금요일 면접", tue), { plannedDate: "2026-10-23", dueDate: "2026-10-23" });
});

test("할 날짜: 그날 하는 일은 그날로, 마감 없음", () => {
  assert.deepEqual(readDates("내일 운동", tue), { plannedDate: "2026-10-21", dueDate: null });
  assert.deepEqual(readDates("모레 장보기", tue), { plannedDate: "2026-10-22", dueDate: null });
});

test("날짜 말이 없으면 오늘, 마감 없음", () => {
  assert.deepEqual(readDates("우유 사기", tue), { plannedDate: tue, dueDate: null });
});

test("요일: 이번 주·다음 주, 지난 요일은 다음 주로", () => {
  assert.equal(readDates("다음 주 월요일까지 과제", tue).dueDate, "2026-10-26");
  assert.equal(readDates("이번 주 금요일까지 과제", tue).dueDate, "2026-10-23");
  assert.equal(readDates("월요일까지 과제", tue).dueDate, "2026-10-26", "이번 주 월요일은 지났으니 다음 월요일");
  assert.equal(readDates("화요일까지 과제", tue).dueDate, tue, "오늘이 화요일");
  assert.equal(readDates("주말까지 정리", tue).dueDate, "2026-10-24");
});

test("지난 날짜는 내년으로", () => {
  assert.equal(readDates("3월 2일까지 신청", tue).dueDate, "2027-03-02");
});

test("마감 배지", () => {
  assert.equal(dueLabel("2026-10-19", tue).tone, "late");
  assert.equal(dueLabel(tue, tue).text, "Due today");
  assert.equal(dueLabel("2026-10-21", tue).text, "Due tomorrow");
  assert.equal(dueLabel("2026-10-23", tue).text, "3 days left");
  assert.equal(dueLabel("2026-10-30", tue).text, "Due Oct 30");
  assert.equal(daysBetween(tue, "2026-11-01"), 12);
});

test("줄 배지", () => {
  assert.deepEqual(dueBadge("2026-10-23", tue), { text: "D-3", tone: "calm" });
  assert.deepEqual(dueBadge(tue, tue), { text: "D-day", tone: "soon" });
  assert.equal(dueBadge("2026-10-21", tue).tone, "soon");
  assert.equal(dueBadge("2026-11-02", tue).text, "NOV 2");
  assert.equal(dueBadge("2026-10-18", tue).tone, "late");
});

test("마감 빠른 선택지", () => {
  assert.deepEqual(deadlineOptions(tue).map((o) => o.date), [tue, "2026-10-21", "2026-10-23", "2026-10-26", "2026-10-27"]);
  // 금요일이면 “이번 주 금요일”은 다음 주 금요일
  assert.equal(deadlineOptions("2026-10-23")[2]!.date, "2026-10-30");
  // 일요일이면 내일과 다음 주 월요일이 같은 날 → 한 번만
  assert.equal(deadlineOptions("2026-10-25").filter((o) => o.date === "2026-10-26").length, 1);
});
