import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultMinutes, keepSentSources, moveEdge, normalizeMix, sizeLabel, splitWords } from "./shape.ts";

test("제목과 원문을 낱말로 나누고 조사와 흔한 말을 처리한다", () => {
  const chips = splitWords("면접 준비", "금요일 토스 PO 면접 준비도 해야 되고 자기소개가 너무 길어");
  const words = chips.map((c) => c.word);
  assert.deepEqual(words.slice(0, 4), ["면접", "준비", "금요일", "토스"]);
  assert.ok(words.includes("자기소개"), "조사 '가'를 뗀다");
  assert.equal(words.filter((w) => w === "면접").length, 1, "같은 낱말은 한 번만");
  assert.equal(chips.find((c) => c.word === "해야")?.on, false);
  assert.equal(chips.find((c) => c.word === "토스")?.on, true);
});

test("한 글자 낱말은 빼고, 최대 개수를 지킨다", () => {
  assert.ok(splitWords("책 읽기", "").every((c) => [...c.word].length >= 2));
  assert.equal(splitWords("a1 b2 c3 d4 e5 f6", "", 3).length, 3);
});

test("크기 기본값은 일정까지 남은 날로 정한다", () => {
  assert.deepEqual(defaultMinutes(null, "2026-10-20"), { minutes: 30, daysLeft: null });
  assert.deepEqual(defaultMinutes("2026-10-21", "2026-10-20"), { minutes: 15, daysLeft: 1 });
  assert.deepEqual(defaultMinutes("2026-10-23", "2026-10-20"), { minutes: 30, daysLeft: 3 });
  assert.deepEqual(defaultMinutes("2026-10-30", "2026-10-20"), { minutes: 60, daysLeft: 10 });
  assert.equal(sizeLabel(15), "15 min");
  assert.equal(sizeLabel(60), "1 hour");
  assert.equal(sizeLabel(120), "2 hours");
});

test("고른 도구만으로 비율을 다시 나누고 합은 100이다", () => {
  const defaults = { figma: 30, calendar: 15, files: 10, todoban: 15, claude: 20 };
  const mix = normalizeMix(defaults, ["figma", "calendar"]);
  assert.equal(Object.values(mix).reduce((a, b) => a + b, 0), 100);
  assert.ok(mix.figma! > mix.calendar!);
  assert.deepEqual(normalizeMix(defaults, []), { claude: 100 });
  const tiny = normalizeMix({ figma: 99, claude: 1 }, ["figma"]);
  assert.equal(tiny.claude, 10, "Claude 몫은 최소 10");
  assert.equal(tiny.figma, 90);
});

test("경계를 옮기면 이웃한 두 칸만 바뀌고 최소값을 지킨다", () => {
  assert.deepEqual(moveEdge([40, 40, 20], 0, 10, [5, 5, 10]), [50, 30, 20]);
  assert.deepEqual(moveEdge([40, 40, 20], 1, 30, [5, 5, 10]), [40, 50, 10]);
  assert.deepEqual(moveEdge([40, 40, 20], 0, -100, [5, 5, 10]), [5, 75, 20]);
});

test("보내지 않은 출처는 버린다", () => {
  const got = keepSentSources(
    [
      { source: "figma", label: "a", weight: 30.4 },
      { source: "gmail", label: "b", weight: 20 },
      { source: "claude", label: "c", weight: 150 },
    ],
    ["figma"],
  );
  assert.deepEqual(got.map((s) => [s.source, s.weight]), [
    ["figma", 30],
    ["claude", 100],
  ]);
});
