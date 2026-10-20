import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, figmaLinkInfo, orderBetween, pendingCarryOver, todayView, localDate } from "./todos.ts";
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

test("확인 창에서 넣은 할 일은 오늘과 나중 각각 맨 아래에 순서대로 붙는다", () => {
  let d = applyAction(emptyData(), { type: "add", title: "기존" }, now);
  d = applyAction(
    d,
    {
      type: "addMany",
      rawText: "원문",
      items: [
        { title: "a", plannedDate: today, isClear: true, shortcutId: null },
        { title: "b", plannedDate: null, isClear: false, shortcutId: null },
        { title: "  ", plannedDate: today, isClear: true, shortcutId: null },
        { title: "c", plannedDate: today, isClear: true, shortcutId: "s" },
      ],
    },
    now,
  );
  const v = todayView(d.todos, today);
  assert.deepEqual(v.open.map((t) => t.title), ["기존", "a", "c"]);
  assert.deepEqual(v.later.map((t) => t.title), ["b"]);
  assert.equal(v.open[2]!.shortcutId, "s");
  assert.equal(v.open[1]!.rawText, "원문");
});

test("첫 행동으로 바꾸면 제목이 바뀌고 정리된 할 일이 된다", () => {
  let d = applyAction(emptyData(), { type: "add", title: "면접 준비" }, now);
  const id = d.todos[0]!.id;
  d = applyAction(d, { type: "applyFirstStep", id, title: "토스 PO 공고 질문 5개 답변 쓰기", shortcutId: null }, now);
  assert.equal(d.todos[0]!.title, "토스 PO 공고 질문 5개 답변 쓰기");
  assert.equal(d.todos[0]!.isClear, true);
  assert.equal(d.todos[0]!.rawText, "면접 준비");
  d = applyAction(d, { type: "applyFirstStep", id, title: "x", shortcutId: "s1" }, now);
  assert.equal(d.todos[0]!.shortcutId, "s1");
});

test("바로가기 저장·수정·삭제", () => {
  let d = applyAction(emptyData(), { type: "add", title: "포폴 장표" }, now);
  d = applyAction(d, { type: "saveShortcut", shortcut: { name: " 포폴 ", keywords: ["포폴", " 포트폴리오 ", "포폴", ""], url: "https://www.figma.com/design/abc/Portfolio?node-id=12-408", appBundleId: "com.figma.Desktop" } }, now);
  const s = d.shortcuts[0]!;
  assert.equal(s.name, "포폴");
  assert.deepEqual(s.keywords, ["포폴", "포트폴리오"]);
  d = applyAction(d, { type: "setShortcut", id: d.todos[0]!.id, shortcutId: s.id }, now);
  d = applyAction(d, { type: "saveShortcut", shortcut: { ...s, name: "포트폴리오" } }, now);
  assert.equal(d.shortcuts.length, 1);
  assert.equal(d.shortcuts[0]!.name, "포트폴리오");
  d = applyAction(d, { type: "removeShortcut", id: s.id }, now);
  assert.equal(d.shortcuts.length, 0);
  assert.equal(d.todos[0]!.shortcutId, null);
});

test("이름이나 링크가 없으면 바로가기를 저장하지 않는다", () => {
  const d = applyAction(emptyData(), { type: "saveShortcut", shortcut: { name: "", keywords: [], url: "x", appBundleId: null } }, now);
  assert.equal(d.shortcuts.length, 0);
});

test("부르는 말이 비면 이름을 부르는 말로 쓴다", () => {
  const d = applyAction(emptyData(), { type: "saveShortcut", shortcut: { name: "사일로", keywords: [], url: "https://figma.com/x", appBundleId: null } }, now);
  assert.deepEqual(d.shortcuts[0]!.keywords, ["사일로"]);
});

test("피그마 링크 판별", () => {
  assert.deepEqual(figmaLinkInfo("https://www.figma.com/design/abc/P?node-id=12-408"), { isFigma: true, hasNode: true });
  assert.deepEqual(figmaLinkInfo("https://figma.com/design/abc/P"), { isFigma: true, hasNode: false });
  assert.deepEqual(figmaLinkInfo("https://notfigma.com/x?node-id=1"), { isFigma: false, hasNode: false });
  assert.deepEqual(figmaLinkInfo("아무거나"), { isFigma: false, hasNode: false });
});

test("설정 바꾸기", () => {
  const d = applyAction(emptyData(), { type: "setSettings", patch: { hotkey: "Alt+Shift+Space" } }, now);
  assert.equal(d.settings.hotkey, "Alt+Shift+Space");
  assert.equal(d.settings.model, "sonnet");
});

test("어제 못 끝낸 할 일 가져오기", () => {
  let d = emptyData();
  for (const t of ["어제 것", "그제 것", "오늘 것", "어제 끝낸 것"]) d = applyAction(d, { type: "add", title: t }, now);
  d.todos[0]!.plannedDate = "2026-10-19";
  d.todos[1]!.plannedDate = "2026-10-18";
  d.todos[3]!.plannedDate = "2026-10-19";
  d.todos[3]!.completedAt = new Date(2026, 9, 19).toISOString();
  const pending = pendingCarryOver(d, today);
  assert.deepEqual(pending.map((t) => t.title).sort(), ["그제 것", "어제 것"]);
  // 묻는 동안에는 오늘 목록에 넣지 않는다
  assert.deepEqual(todayView(d.todos, today, pending).open.map((t) => t.title), ["오늘 것"]);

  const toToday = applyAction(d, { type: "carryOver", to: "today" }, now);
  assert.equal(toToday.settings.lastCarryOverCheck, today);
  assert.equal(pendingCarryOver(toToday, today).length, 0);
  assert.equal(todayView(toToday.todos, today).open.length, 3);

  const toLater = applyAction(d, { type: "carryOver", to: "later" }, now);
  assert.equal(todayView(toLater.todos, today).later.length, 2);
  assert.equal(todayView(toLater.todos, today).open.length, 1);
});

test("오늘 이미 물었으면 다시 묻지 않는다", () => {
  let d = applyAction(emptyData(), { type: "add", title: "어제 것" }, now);
  d.todos[0]!.plannedDate = "2026-10-19";
  d = { ...d, settings: { ...d.settings, lastCarryOverCheck: today } };
  assert.equal(pendingCarryOver(d, today).length, 0);
});

test("날짜 옮기기: 내일·나중은 맨 아래로, 오늘은 오늘 맨 아래로", () => {
  let d = emptyData();
  d = applyAction(d, { type: "add", title: "a" }, now);
  d = applyAction(d, { type: "add", title: "b" }, now);
  const [a, b] = d.todos;
  d = applyAction(d, { type: "schedule", id: a!.id, plannedDate: "2026-10-21" }, now);
  assert.equal(d.todos.find((t) => t.id === a!.id)!.plannedDate, "2026-10-21");
  assert.ok(d.todos.find((t) => t.id === a!.id)!.order > d.todos.find((t) => t.id === b!.id)!.order);
  d = applyAction(d, { type: "schedule", id: b!.id, plannedDate: null }, now);
  assert.equal(d.todos.find((t) => t.id === b!.id)!.plannedDate, null);
  d = applyAction(d, { type: "schedule", id: a!.id, plannedDate: today }, now);
  assert.deepEqual(todayView(d.todos, today).open.map((t) => t.title), ["a"]);
});

test("지운 할 일을 되살리면 제목·날짜·순서가 그대로다", () => {
  let d = emptyData();
  d = applyAction(d, { type: "add", title: "포폴 손보기" }, now);
  d = applyAction(d, { type: "add", title: "면접 준비" }, now);
  const gone = d.todos[0]!;
  d = applyAction(d, { type: "remove", id: gone.id }, now);
  assert.equal(d.todos.length, 1);
  d = applyAction(d, { type: "restore", item: gone }, now);
  assert.deepEqual(todayView(d.todos, today).open.map((t) => t.title), ["포폴 손보기", "면접 준비"]);
  assert.equal(applyAction(d, { type: "restore", item: gone }, now).todos.length, 2, "두 번 되살려도 하나");
});

test("이름 바꾸기: 앞뒤 공백을 빼고, 빈 이름은 무시한다", () => {
  let d = applyAction(emptyData(), { type: "add", title: "포폴 손보기" }, now);
  const id = d.todos[0]!.id;
  d = applyAction(d, { type: "rename", id, title: "  포폴 3번 장표 고치기 " }, now);
  assert.equal(d.todos[0]!.title, "포폴 3번 장표 고치기");
  assert.equal(applyAction(d, { type: "rename", id, title: "  " }, now).todos[0]!.title, "포폴 3번 장표 고치기");
});
