import { test } from "node:test";
import assert from "node:assert/strict";
import { displayAccelerator, toAccelerator } from "./hotkey.ts";

const ev = (code: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test("수정 키 + 키를 accelerator로 바꾼다", () => {
  assert.equal(toAccelerator(ev("Space", { altKey: true })), "Alt+Space");
  assert.equal(toAccelerator(ev("KeyT", { metaKey: true, shiftKey: true })), "Command+Shift+T");
  assert.equal(toAccelerator(ev("Digit1", { ctrlKey: true, altKey: true })), "Control+Alt+1");
});

test("수정 키 없는 일반 키나 수정 키만은 받지 않는다", () => {
  assert.equal(toAccelerator(ev("KeyA")), null);
  assert.equal(toAccelerator(ev("AltLeft", { altKey: true })), null);
  assert.equal(toAccelerator(ev("F5")), "F5");
});

test("맥 기호로 보여 준다", () => {
  assert.equal(displayAccelerator("Alt+Space"), "⌥ Space");
  assert.equal(displayAccelerator("Command+Shift+T"), "⇧⌘ T");
});
