import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceLines, firstLines, isDocumentPath, rankFiles, spotlightQuery } from "./fileMatch.ts";

test("Spotlight 질의: 이름·내용, 최근 30일 열었거나 고친 파일", () => {
  const q = spotlightQuery(["면접", "준비"])!;
  assert.ok(q.includes('kMDItemDisplayName == "*면접*"cd'));
  assert.ok(q.includes('kMDItemTextContent == "*준비*"cd'));
  assert.ok(q.includes("kMDItemContentModificationDate >= $time.today(-30)"));
  assert.equal(spotlightQuery(["a"]), null, "한 글자는 빼고 남는 게 없으면 null");
  assert.ok(!spotlightQuery(['x"y*'])!.includes('x"y'), "따옴표·별표는 지운다");
});

test("문서가 아닌 경로는 뺀다", () => {
  assert.equal(isDocumentPath("/Users/a/Documents/면접.md"), true);
  assert.equal(isDocumentPath("/Users/a/Library/Caches/x.txt"), false);
  assert.equal(isDocumentPath("/Users/a/p/node_modules/x/README.md"), false);
  assert.equal(isDocumentPath("/Users/a/.config/x.md"), false);
  assert.equal(isDocumentPath("/Users/a/code/app/src/shape.test.ts"), false, "코드 파일은 문서가 아님");
  assert.equal(isDocumentPath("/Users/a/Desktop/회의록.docx"), true);
});

test("고르기: 이름에 맞으면 무겁게, 내용만 맞아도 찾는다", () => {
  const r = rankFiles(
    [
      { path: "/a/메모 3.txt", name: "메모 3.txt", modified: 3, content: "토스 면접 준비: 자기소개 1분" },
      { path: "/a/면접.md", name: "면접.md", modified: 1, content: "질문 목록" },
      { path: "/a/장보기.txt", name: "장보기.txt", modified: 5, content: "우유" },
    ],
    ["면접", "준비"],
  );
  assert.deepEqual(r.map((x) => x.name), ["메모 3.txt", "면접.md"], "이름 1×2 = 내용 2, 같으면 최근 것. 관련 없는 파일은 뺌");
  assert.equal(r[0]!.inContent, 2);
});

test("근거 줄: 낱말이 가장 많은 줄과 다음 줄", () => {
  const c = "# 노트\n\n## 면접 준비\n자기소개는 1분 안에\n장보기";
  assert.equal(evidenceLines(c, ["면접", "준비"]), "면접 준비 · 자기소개는 1분 안에 · 장보기");
  assert.equal(evidenceLines(c, ["운동"]), null);
  assert.equal(firstLines("a\n\nb\nc\nd"), "a b c");
});

test("자모가 풀린(NFD) 파일 이름도 맞힌다", () => {
  const nfd = "연봉협상_체크리스트.md".normalize("NFD");
  const r = rankFiles([{ path: "/a/" + nfd, name: nfd, modified: 1, content: null }], ["연봉", "협상"]);
  assert.equal(r[0]!.inName, 2);
});
