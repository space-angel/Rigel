import { displayAccelerator } from "@shared/hotkey";
import { LOCAL_SOURCES } from "@shared/shape";

// 화면에서 맥과 윈도우를 가른다. 맥은 ⌘, 윈도우는 Ctrl이 앱 단축키의 수정 키다.
export const IS_MAC = window.todoban.platform === "darwin";
export const modKey = (e: { metaKey: boolean; ctrlKey: boolean }) => (IS_MAC ? e.metaKey : e.ctrlKey);
export const showHotkey = (acc: string) => displayAccelerator(acc, IS_MAC);
// 화면에 적는 단축키 글자: 맥 ⌘Z, 윈도우 Ctrl+Z
export const modLabel = (key: string) => (IS_MAC ? `⌘${key}` : `Ctrl+${key}`);
// 이 컴퓨터에서 쓸 수 있는 로컬 도구. 캘린더·파일 찾기는 맥 기능(osascript·Spotlight)이라 윈도우에서는 뺀다.
export const LOCAL_AVAILABLE = LOCAL_SOURCES.filter((s) => IS_MAC || (s !== "calendar" && s !== "files"));
