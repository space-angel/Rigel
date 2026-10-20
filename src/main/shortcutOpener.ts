import { shell } from "electron";
import { execFile } from "node:child_process";
import type { Shortcut } from "@shared/types";

// 지정한 앱(기본 피그마 데스크톱)으로 링크를 연다. 앱이 없거나 실패하면 기본 브라우저로 연다.
export function openShortcut(s: Shortcut): Promise<"app" | "browser"> {
  return new Promise((resolve) => {
    const fallback = () => shell.openExternal(s.url).then(() => resolve("browser"));
    if (!s.appBundleId) {
      fallback();
      return;
    }
    execFile("/usr/bin/open", ["-b", s.appBundleId, s.url], (err) => (err ? fallback() : resolve("app")));
  });
}
