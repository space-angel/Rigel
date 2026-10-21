import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserWindow } from "electron";

// 화면 확인용 시나리오 실행기 (TODOBAN_E2E=<시나리오 JSON>, TODOBAN_E2E_OUT=<결과 폴더>).
// 창을 띄우지 않고 렌더러에서 클릭·입력을 흉내 내고, 단계마다 결과와 스크린샷을 남긴다. 사용 중인 화면을 방해하지 않는다.
export type E2EWindow = "list" | "quick" | "review" | "settings" | "welcome";

export interface E2EStep {
  name: string;
  win: E2EWindow;
  main?: string; // 메인 프로세스 동작: "openSettings:<tab>", "openList", "shape:<할 일 제목>", "setData:<json patch path>", "key:<창>:<키>:<modifier,…>" 등
  run?: string; // 렌더러에서 실행할 JS (await 가능). __e2e 도우미를 쓸 수 있다
  until?: string; // 참이 될 때까지 기다릴 JS 식
  expect?: string; // 마지막에 참이어야 하는 JS 식
  timeout?: number;
  wait?: number; // 끝나고 더 기다릴 시간
  snap?: boolean;
  note?: string;
}

export interface E2EResult {
  name: string;
  win: E2EWindow;
  ok: boolean;
  ms: number;
  error?: string;
  value?: unknown;
  snap?: string;
  note?: string;
}

const HELPERS = `
window.__e2e = window.__e2e || {
  $(sel) { return document.querySelector(sel); },
  all(sel) { return [...document.querySelectorAll(sel)]; },
  byText(text, sel = "button, [role=button], [role=tab], label, a, .row, .tool, .word") {
    return [...document.querySelectorAll(sel)].find((el) => el.textContent.replace(/\\s+/g, " ").trim().includes(text));
  },
  click(target) {
    const el = typeof target === "string" ? (document.querySelector(target) || this.byText(target)) : target;
    if (!el) throw new Error("못 찾음: " + target);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    el.click();
    return true;
  },
  type(sel, value) {
    const el = document.querySelector(sel);
    if (!el) throw new Error("입력칸 못 찾음: " + sel);
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  },
  key(sel, key, opts = {}) {
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) throw new Error("키 대상 못 찾음: " + sel);
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
    return true;
  },
  text(sel = "body") { const el = document.querySelector(sel); return el ? el.textContent.replace(/\\s+/g, " ").trim() : null; },
  // 화면 부담 재기: 보이는 버튼·입력·토글 수, 보이는 글자 수, 강조(주 버튼) 수
  audit() {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).opacity !== "0"; };
    const controls = [...document.querySelectorAll("button, input, textarea, select, [role=switch], [role=slider], [role=checkbox]")].filter(vis);
    const primary = controls.filter((el) => el.classList.contains("button--primary") || el.classList.contains("capture__send")).length;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let chars = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { const p = n.parentElement; if (p && vis(p)) chars += n.textContent.replace(/\\s+/g, "").length; }
    return { controls: controls.length, primary, chars };
  },
};
true;
`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runE2E(
  file: string,
  outDir: string,
  ctx: { window: (w: E2EWindow) => BrowserWindow | null; main: (action: string) => void | Promise<void> },
): Promise<E2EResult[]> {
  const steps: E2EStep[] = JSON.parse(readFileSync(file, "utf8"));
  mkdirSync(outDir, { recursive: true });
  const results: E2EResult[] = [];
  const save = () => writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));

  for (const [i, step] of steps.entries()) {
    const started = Date.now();
    const result: E2EResult = { name: step.name, win: step.win, ok: true, ms: 0, note: step.note };
    try {
      if (step.main) await ctx.main(step.main);
      const win = ctx.window(step.win);
      if (!win) throw new Error(`${step.win} 창이 없음`);
      const js = (code: string) => win.webContents.executeJavaScript(`${HELPERS}\n(async () => { ${code} })()`);
      if (step.run) result.value = await js(step.run);
      if (step.until) {
        const deadline = Date.now() + (step.timeout ?? 15_000);
        while (!(await js(`return Boolean(${step.until});`))) {
          if (Date.now() > deadline) throw new Error(`기다림 초과: ${step.until}`);
          await sleep(250);
        }
      }
      if (step.wait) await sleep(step.wait);
      if (step.expect && !(await js(`return Boolean(${step.expect});`))) {
        const seen = await js(`return __e2e.text("body")?.slice(0, 300);`);
        throw new Error(`기대와 다름: ${step.expect} · 화면: ${seen}`);
      }
    } catch (e) {
      result.ok = false;
      result.error = e instanceof Error ? e.message : String(e);
    }
    if (step.snap || !result.ok) {
      const win = ctx.window(step.win);
      if (win) {
        await sleep(300);
        const name = `${String(i + 1).padStart(2, "0")}-${step.win}.png`;
        writeFileSync(join(outDir, name), (await win.webContents.capturePage()).toPNG());
        result.snap = name;
      }
    }
    result.ms = Date.now() - started;
    results.push(result);
    save();
    console.log(`[e2e] ${result.ok ? "✓" : "✗"} ${step.name} (${result.ms}ms)${result.error ? ` — ${result.error}` : ""}`);
  }
  return results;
}
