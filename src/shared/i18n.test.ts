import { test } from "node:test";
import assert from "node:assert/strict";
import { translate } from "./i18n.ts";
import { deadlineOptions, dueBadge, dueLabel } from "./due.ts";
import { sizeLabel } from "./shape.ts";

test("한국어: 사전에 있으면 바꾸고 자리를 채운다, 없으면 영어 그대로", () => {
  assert.equal(translate("ko", "Today"), "오늘");
  assert.equal(translate("ko", "{n} open", { n: 3 }), "3개 남음");
  assert.equal(translate("en", "{n} open", { n: 3 }), "3 open");
  assert.equal(translate("ko", "Not in the dictionary"), "Not in the dictionary");
});

test("마감 표시도 언어를 따른다", () => {
  assert.equal(dueLabel("2026-10-24", "2026-10-21", "ko").text, "3일 남았어요");
  assert.equal(dueLabel("2026-10-24", "2026-10-21").text, "3 days left");
  assert.equal(dueBadge("2026-10-20", "2026-10-21", "ko").text, "지남");
  assert.equal(deadlineOptions("2026-10-21", "ko")[0]!.label, "오늘");
  assert.match(deadlineOptions("2026-10-21", "ko")[2]!.label, /^이번 주 금요일 · 10월 23일/);
  assert.equal(sizeLabel(25, "ko"), "25분");
});
