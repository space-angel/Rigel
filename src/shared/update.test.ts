import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, macDownloadUrl } from "./update.ts";

test("버전 비교: 자릿수별로, v는 무시, 정식이 미리 보기보다 새것", () => {
  assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
  assert.equal(compareVersions("v0.1.10", "0.1.9"), 1);
  assert.equal(compareVersions("0.1.0", "v0.1.0"), 0);
  assert.equal(compareVersions("0.1.0", "0.1.0-beta.1"), 1);
  assert.equal(compareVersions("1.0.0", "1.0"), 0);
  assert.equal(compareVersions("0.9.9", "1.0.0"), -1);
});

test("맥 설치 파일은 늘 최신 릴리스를 가리킨다", () => {
  assert.equal(macDownloadUrl("arm64"), "https://github.com/space-angel/rigel-releases/releases/latest/download/Rigel-mac-arm64.dmg");
  assert.equal(macDownloadUrl("x64"), "https://github.com/space-angel/rigel-releases/releases/latest/download/Rigel-mac-x64.dmg");
});
