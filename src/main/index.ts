import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, systemPreferences, Tray } from "electron";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { FIGMA_BUNDLE_ID, type AppData, type TodoAction } from "@shared/types";
import { applyAction, localDate, pendingCarryOver, todayView } from "@shared/todos";
import { addDays } from "@shared/dial";
import { deadlineOptions, readDates } from "@shared/due";
import { msg, translate, type Vars } from "@shared/i18n";
import { classifyQuickInput, firstLine, matchShortcutByKeywords } from "@shared/quickInput";
import { loadData, saveData } from "./store";
import type { ReviewDraft } from "@shared/review";
import { ReviewSession, clearPending, loadPending, savePending } from "./review";
import { FirstStepManager } from "./firstStep";
import { collectLocal } from "./tools/local";
import { collectMcp, markNeedsAuth, mcpStatus, verifyMcp } from "./tools/mcp";
import { safeServiceUrl, type McpSource } from "@shared/mcp";
import type { ShapeInput, ToolItem } from "@shared/shape";
import { openShortcut } from "./shortcutOpener";
import { runE2E } from "./e2e";
import { Updater } from "./updater";
import { claudeAuth, claudeVersion, ensureWorkDir, findClaude, resetRules, resourcePath, rulesStatus } from "./claude/setup";

app.setName("todoBAN");
const IS_MAC = process.platform === "darwin";
const IS_WIN = process.platform === "win32";
// 윈도우는 알림·작업 표시줄이 앱을 이 ID로 묶는다(배포 설정의 appId와 같아야 한다).
if (IS_WIN) app.setAppUserModelId("com.todoban.app");
// 개발 중 확인용: 실제 데이터 대신 다른 폴더를 쓰고, 실행하자마자 목록이나 빠른 입력창을 띄운다.
if (process.env.TODOBAN_USER_DATA) app.setPath("userData", process.env.TODOBAN_USER_DATA);
const SHOW_ON_START = process.env.TODOBAN_SHOW_ON_START; // "list" | "quick"
const KEEP_OPEN = process.env.TODOBAN_KEEP_OPEN === "1"; // 화면 확인용: 포커스를 잃어도 닫지 않는다
// 화면 확인용: 확인 창을 띄우지 않고 결과 화면을 PNG로 저장한 뒤 종료한다. 사용 중인 화면을 방해하지 않는다.
const SNAPSHOT = process.env.TODOBAN_SNAPSHOT;
// 화면 확인용: 시작하자마자 이 제목의 할 일에 첫 행동을 요청하고, 질문이 오면 ANSWER로 답한 뒤 목록을 저장한다.
const DEMO_FIRSTSTEP = process.env.TODOBAN_FIRSTSTEP_TITLE;
const DEMO_ANSWER = process.env.TODOBAN_FIRSTSTEP_ANSWER;
// 화면 확인용: 빠른 입력을 넣은 것처럼 처리한 뒤 목록을, 또는 설정 창을 저장한다.
const DEMO_QUICK = process.env.TODOBAN_QUICK_TEXT;
const DEMO_SETTINGS = process.env.TODOBAN_SETTINGS_TAB as "general" | "tools" | "shortcuts" | "shortcuts-new" | undefined;
const DEMO_SHAPE = process.env.TODOBAN_SHAPE_TITLE; // 화면 확인용: 이 할 일로 빚기(C1)를 연다
const DEMO_SHAPE_GO = process.env.TODOBAN_SHAPE_GO === "1"; // 화면 확인용: 바로 Shape it을 눌러 결과(C2)까지 간다
// 화면 확인용: 시나리오를 돌리고 결과를 저장한 뒤 종료한다 (src/main/e2e.ts). 창을 띄우지 않고, 다른 앱도 열지 않는다.
const E2E = process.env.TODOBAN_E2E;
// 화면 확인용: 목록과 빠른 입력창을 화면 밖에 포커스 없이 띄워, macOS가 그리는 창 그림자까지 PNG로 찍고 종료한다.
const WINDOW_SHOT = process.env.TODOBAN_WINDOW_SHOT;
const HEADLESS = Boolean(SNAPSHOT || E2E || WINDOW_SHOT);

// 바깥 앱(피그마, 터미널, 브라우저)을 여는 동작. 시나리오 실행 중에는 열지 않고 기록만 한다.
function openOutside(what: string, fn: () => unknown): void {
  if (E2E) console.log(`[e2e] 열기 생략: ${what}`);
  else fn();
}

async function snapshotAndQuit(win: BrowserWindow | null): Promise<void> {
  if (!SNAPSHOT || !win) return;
  const img = await win.webContents.capturePage();
  writeFileSync(SNAPSHOT, img.toPNG());
  quitting = true;
  app.quit();
}

// 목록과 빠른 입력창은 투명 창이고 창 크기가 곧 카드 크기다. 그림자는 macOS가 카드의 둥근 모양을 따라 창 밖에 그린다.
// (예전에는 CSS로 창 안에 그렸는데, 여백보다 넓게 번진 그림자가 창 가장자리에서 잘려 각진 회색 띠가 생겼다.)
const LIST_WIDTH = 360;
const LIST_MAX_HEIGHT = 604;
const QUICK_WIDTH = 640;
const QUICK_MAX_HEIGHT = 220;
const REVIEW_WIDTH = 520;
const REVIEW_MAX_HEIGHT = 660;

let tray: Tray | null = null;
let listWindow: BrowserWindow | null = null;
let quickWindow: BrowserWindow | null = null;
let reviewWindow: BrowserWindow | null = null;
let review: ReviewSession | null = null;
let quitting = false;
let firstSteps: FirstStepManager;
let settingsWindow: BrowserWindow | null = null;
let welcomeWindow: BrowserWindow | null = null;
let data: AppData;
// 단축키를 못 쓰는 이유. 화면에 보일 때 지금 언어로 바꾼다.
let updater: Updater;
let hotkeyFail: { key: string; accelerator: string } | null = null;
const tr = (key: string, vars?: Vars) => translate(data.settings.language, key, vars);
const hotkeyError = () => (hotkeyFail ? tr(hotkeyFail.key, { key: hotkeyFail.accelerator }) : null);

function updateTray(): void {
  const today = localDate();
  const { open } = todayView(data.todos, today, pendingCarryOver(data, today));
  // 맥은 메뉴바 아이콘 옆에 숫자, 윈도우 트레이는 글자를 못 붙여서 툴팁으로
  if (IS_MAC) tray?.setTitle(open.length ? ` ${open.length}` : "", { fontType: "monospacedDigit" });
  else tray?.setToolTip(open.length ? `todoBAN · ${tr("{n} open", { n: open.length })}` : "todoBAN");
}

function broadcast(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("data:changed", data);
  updateTray();
}

// 미리 찾기: 오늘 맨 위의 할 일이 첫 행동이 필요하면 뒤에서 찾아 둔다. 물어보면 기다리지 않고 바로 보인다.
// 하나만 찾는다(Claude 사용량). 자동 점검(E2E)에서는 TODOBAN_PREFETCH=1일 때만(점검마다 사용량을 쓰지 않게).
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
function maybePrefetch(): void {
  if (!data.settings.prefetch || (E2E && process.env.TODOBAN_PREFETCH !== "1") || !firstSteps) return;
  if (prefetchTimer) clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(() => {
    const today = localDate();
    const top = todayView(data.todos, today, pendingCarryOver(data, today)).open[0];
    if (top && !top.isClear) firstSteps.prefetch(top.id);
  }, 600);
}

function act(action: TodoAction): AppData {
  const prevHotkey = data.settings.hotkey;
  const prevLogin = data.settings.openAtLogin;
  data = applyAction(data, action);
  saveData(data);
  if (data.settings.hotkey !== prevHotkey) registerHotkey();
  if (data.settings.openAtLogin !== prevLogin) app.setLoginItemSettings({ openAtLogin: data.settings.openAtLogin });
  broadcast();
  if (listWindow?.isVisible() || E2E) maybePrefetch();
  return data;
}

// 일반 창(설정·확인·시작하기)의 테두리. 맥은 신호등 버튼을 안쪽에 둔 제목 없는 창,
// 윈도우는 제목 표시줄을 숨기고 최소화·닫기 버튼을 오른쪽 위에 겹친다(내용 위쪽 여백이 그 자리를 비워 둔다).
function windowChrome(): Partial<Electron.BrowserWindowConstructorOptions> {
  if (IS_MAC) return { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 } };
  return { titleBarStyle: "hidden", titleBarOverlay: { color: "#15181d", symbolColor: "#c9ced8", height: 36 } };
}

function createPopupWindow(view: "list" | "quick", width: number, height: number): BrowserWindow {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
    },
  });
  // 전체 화면 앱 위에서도 뜨게 한다.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, view === "quick" ? "pop-up-menu" : "floating");
  win.on("blur", () => {
    // 고정한 목록은 다른 앱을 눌러도 닫지 않는다.
    if (view === "list" && listPinned()) return;
    if (!KEEP_OPEN && !win.webContents.isDevToolsOpened()) win.hide();
  });
  loadView(win, view);
  return win;
}

// 성능 측정용(TODOBAN_PERF=1): 창 크기 바꾸기·그림자 다시 계산에 걸린 시간을 남긴다.
const PERF = process.env.TODOBAN_PERF === "1";
export const perfLog: { t: number; what: string; ms: number }[] = [];
const perfStart = Date.now();

function fitHeight(win: BrowserWindow | null, height: number, max: number): void {
  if (!win) return;
  const h = Math.min(Math.max(Math.ceil(height), 80), max);
  const b = win.getBounds();
  if (b.height === h) return;
  const t0 = performance.now();
  // 아래에서 연 목록(윈도우 작업 표시줄 위)은 아래 끝을 붙인 채 위로 자란다
  const bottom = win === listWindow && listAnchorBottom !== null && !listPinned() ? listAnchorBottom : null;
  win.setBounds({ ...b, height: h, ...(bottom !== null && { y: Math.round(bottom - h) }) });
  const t1 = performance.now();
  // 투명 창의 그림자는 모양이 바뀌면 다시 계산해야 이전 크기의 그림자가 남지 않는다.
  win.invalidateShadow?.();
  if (PERF) perfLog.push({ t: Date.now() - perfStart, what: `setBounds ${b.height}→${h}`, ms: t1 - t0 }, { t: Date.now() - perfStart, what: "invalidateShadow", ms: performance.now() - t1 });
}

const listPinned = () => Boolean(data?.settings.listPin.pinned);

// 다른 창(빠른 입력, 설정, 피그마·노션 열기)을 띄울 때 목록을 닫는다. 고정했으면 그대로 둔다.
function hideLooseList(): void {
  if (!listPinned()) listWindow?.hide();
}

// 고정하면 창을 옮길 수 있고, 옮긴 자리를 기억한다. 풀면 다시 메뉴바 아래로.
function applyListPin(): void {
  if (!listWindow) return;
  const pin = data.settings.listPin;
  listWindow.setMovable(pin.pinned);
  if (pin.pinned && pin.x !== null && pin.y !== null) {
    const b = listWindow.getBounds();
    // 저장한 자리가 지금 연결된 화면 밖이면 메뉴바 아래로
    const onScreen = screen.getAllDisplays().some((d) => pin.x! >= d.bounds.x && pin.x! < d.bounds.x + d.bounds.width && pin.y! >= d.bounds.y && pin.y! < d.bounds.y + d.bounds.height);
    if (onScreen) listWindow.setBounds({ ...b, x: pin.x, y: pin.y });
    else positionListWindow();
  } else positionListWindow();
}

// 목록은 트레이 아이콘에 붙어서 연다. 맥은 위 메뉴바 아래로, 윈도우는 보통 아래 작업 표시줄이라 그 위로 연다.
// 아래에서 열면 창이 커질 때 아래 끝을 붙인 채 위로 자란다(listAnchorBottom).
let listAnchorBottom: number | null = null;
function positionListWindow(): void {
  if (!tray || !listWindow) return;
  const t = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: t.x || 0, y: t.y || 0 });
  const { width, height } = listWindow.getBounds();
  const area = display.workArea;
  // 트레이 자리를 모르면(일부 윈도우 환경) 화면 오른쪽 아래에 둔다
  const known = t.width > 0 && t.height > 0;
  const cx = known ? t.x + t.width / 2 : area.x + area.width - width / 2 - 12;
  const x = Math.round(Math.min(Math.max(cx - width / 2, area.x + 8), area.x + area.width - width - 8));
  const below = known && t.y < display.bounds.y + display.bounds.height / 2;
  if (below) {
    listAnchorBottom = null;
    listWindow.setPosition(x, Math.round(Math.max(t.y + t.height + 2, area.y)));
  } else {
    listAnchorBottom = area.y + area.height - 8;
    listWindow.setPosition(x, Math.round(listAnchorBottom - height));
  }
}

function toggleListWindow(): void {
  if (!listWindow) return;
  if (listWindow.isVisible()) {
    listWindow.hide();
    return;
  }
  quickWindow?.hide();
  applyListPin();
  listWindow.show();
  listWindow.invalidateShadow?.();
  listWindow.focus();
  listWindow.webContents.send("list:opened");
  settleShadow(listWindow);
  maybePrefetch();
}

// 일반 창(설정·확인·시작하기)은 내용 높이가 바뀌면 macOS 기본 창 애니메이션으로 크기를 바꾼다.
// 운영체제가 그리므로 가장 가볍다. 보이지 않는 창(처음 열기 전, 화면 확인용)은 바로 바꾼다.
function resizeAnimated(win: BrowserWindow, w: number, h: number): void {
  const animate = win.isVisible() && !HEADLESS && !systemPrefersReducedMotion();
  win.setContentSize(w, h, animate);
}

function systemPrefersReducedMotion(): boolean {
  return process.platform === "darwin" && systemPreferences.getAnimationSettings().prefersReducedMotion;
}

let shadowTimer: ReturnType<typeof setInterval> | null = null;
function followShadow(win: BrowserWindow | null, ms: number): void {
  if (!win || HEADLESS) return;
  if (shadowTimer) clearInterval(shadowTimer);
  const until = Date.now() + Math.min(ms, 600);
  shadowTimer = setInterval(() => {
    if (win.isDestroyed() || Date.now() > until) {
      if (shadowTimer) clearInterval(shadowTimer);
      shadowTimer = null;
      if (!win.isDestroyed()) win.invalidateShadow?.();
      return;
    }
    win.invalidateShadow?.();
  }, 16);
}

// 여는 움직임(240ms)이 끝난 뒤 그림자를 다시 계산한다. 움직이는 중 모양으로 그림자가 남지 않게.
function settleShadow(win: BrowserWindow): void {
  setTimeout(() => !win.isDestroyed() && win.invalidateShadow?.(), 280);
}

// 빠른 입력창은 마우스가 있는 화면의 가운데보다 조금 위에 띄운다.
function showQuickWindow(): void {
  if (!quickWindow) return;
  if (quickWindow.isVisible()) {
    quickWindow.hide();
    return;
  }
  hideLooseList();
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const { width } = quickWindow.getBounds();
  quickWindow.setPosition(Math.round(area.x + (area.width - width) / 2), Math.round(area.y + area.height * 0.22));
  app.focus({ steal: true });
  quickWindow.show();
  quickWindow.invalidateShadow?.();
  quickWindow.focus();
  settleShadow(quickWindow);
  quickWindow.webContents.send("quick:opened");
}

function loadView(win: BrowserWindow, view: string): void {
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html#${view}`);
  else win.loadFile(join(__dirname, "../renderer/index.html"), { hash: view });
}

// 확인 창은 신호등 버튼이 있는 일반 창이다. 닫기 버튼은 취소와 같다.
function createReviewWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: REVIEW_WIDTH,
    height: 360,
    useContentSize: true,
    show: false,
    title: tr("Review"),
    ...windowChrome(),
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#15181d",
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true },
  });
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    cancelReview();
  });
  loadView(win, "review");
  return win;
}

function sendReview(): void {
  if (!review) return;
  reviewWindow?.webContents.send("review:state", review.state);
  if (SNAPSHOT && review.state.status !== "loading") {
    setTimeout(() => snapshotAndQuit(reviewWindow), 800);
  }
}

function startReview(rawText: string): void {
  savePending(rawText);
  review?.cancel();
  review = new ReviewSession(rawText, () => data, sendReview);
  sendReview();
  if (reviewWindow && !HEADLESS) {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const b = reviewWindow.getBounds();
    reviewWindow.setPosition(Math.round(area.x + (area.width - b.width) / 2), Math.round(area.y + area.height * 0.12));
    app.focus({ steal: true });
    reviewWindow.show();
    reviewWindow.focus();
  }
  review.split();
}

function endReview(): void {
  review?.cancel();
  review = null;
  clearPending();
  reviewWindow?.hide();
}

function cancelReview(): void {
  endReview();
}

// 설정 창은 탭이 늘 같은 자리에 있게 위쪽을 고정하고 아래로만 늘린다.
// 가장 긴 탭(SETTINGS_MAX)이 들어갈 자리를 화면 가운데에 잡아 두고, 그 안에서만 늘어난다.
// 도구 탭(연결 안내까지 펼친 경우)도 스크롤 없이 다 보이도록 넉넉히 잡는다. 화면이 그보다 작을 때만 창 안에서 스크롤한다.
const SETTINGS_WIDTH = 560;
const SETTINGS_MAX = 960;
const SCREEN_GAP = 24;
function settingsFrame(): { x: number; y: number; maxHeight: number } {
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const maxHeight = Math.min(SETTINGS_MAX, wa.height - SCREEN_GAP * 2);
  return { x: Math.round(wa.x + (wa.width - SETTINGS_WIDTH) / 2), y: Math.round(wa.y + (wa.height - maxHeight) / 2), maxHeight };
}

function showSettings(tab: "general" | "tools" | "shortcuts" | "shortcuts-new" = "general"): void {
  hideLooseList();
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    const frame = settingsFrame();
    settingsWindow = new BrowserWindow({
      x: frame.x,
      y: frame.y,
      width: SETTINGS_WIDTH,
      height: 520,
      useContentSize: true,
      show: false,
      title: tr("Settings"),
      ...windowChrome(),
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: "#15181d",
      webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true },
    });
    loadView(settingsWindow, `settings-${tab}`);
    settingsWindow.once("ready-to-show", () => {
      if (SNAPSHOT) {
        setTimeout(() => snapshotAndQuit(settingsWindow), 1500);
        return;
      }
      if (E2E) return;
      app.focus({ steal: true });
      settingsWindow?.show();
    });
    settingsWindow.on("closed", () => (settingsWindow = null));
    // 터미널에서 연결하고 돌아오면 도구 탭이 상태를 다시 확인할 수 있게 알린다.
    settingsWindow.on("focus", () => settingsWindow?.webContents.send("settings:focus"));
    return;
  }
  settingsWindow.webContents.send("settings:tab", tab === "shortcuts-new" ? "shortcuts" : tab);
  if (E2E) return;
  app.focus({ steal: true });
  settingsWindow.show();
  settingsWindow.focus();
}

// 처음 실행하면 시작하기 창(D4)을 연다. Claude Code, 단축키, 도구를 한 장에서 확인한다.
function showWelcome(): void {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    if (!HEADLESS) welcomeWindow.show();
    return;
  }
  welcomeWindow = new BrowserWindow({
    width: 480,
    height: 560,
    useContentSize: true,
    show: false,
    title: tr("Welcome"),
    ...windowChrome(),
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#15181d",
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true },
  });
  loadView(welcomeWindow, "welcome");
  welcomeWindow.once("ready-to-show", () => {
    if (HEADLESS) return;
    app.focus({ steal: true });
    welcomeWindow?.show();
  });
  welcomeWindow.on("focus", () => welcomeWindow?.webContents.send("settings:focus"));
  welcomeWindow.on("closed", () => (welcomeWindow = null));
}

// 할 일을 넣으면 메뉴바 목록을 열어 방금 넣은 할 일을 보여 준다(잠깐 빛나고, 그 줄로 스크롤).
// 목록이 이미 열려 있으면(아래 입력 바로 넣은 경우) 표시만 한다.
function addAndReveal(action: TodoAction): void {
  const before = new Set(data.todos.map((t) => t.id));
  act(action);
  const added = data.todos.filter((t) => !before.has(t.id)).map((t) => t.id);
  if (!added.length || !listWindow) return;
  if (!listWindow.isVisible() && !HEADLESS) {
    quickWindow?.hide();
    applyListPin();
    listWindow.show();
    listWindow.invalidateShadow?.();
    listWindow.focus();
  }
  listWindow.webContents.send("list:opened", { highlight: added });
}

// 한 줄 30자 이하는 그대로 넣고(부르는 말이 있으면 바로가기 연결), 긴 입력은 확인 창에서 Claude에게 나눠 달라고 한다.
function submitQuick(text: string): { ok: boolean; kind?: "short" | "long" } {
  const kind = classifyQuickInput(text);
  if (kind === "empty") return { ok: false };
  quickWindow?.hide();
  // 짧은 입력은 AI 없이 앱이 날짜 말을 읽는다: “금요일까지 …”는 마감, “내일 …”은 할 날짜.
  if (kind === "short")
    addAndReveal({ type: "add", title: text.trim(), rawText: text, shortcutId: matchShortcutByKeywords(text, data.shortcuts), ...readDates(text, localDate()) });
  else startReview(text);
  return { ok: true, kind };
}

function registerHotkey(): void {
  if (HEADLESS) return;
  globalShortcut.unregisterAll();
  const accelerator = data.settings.hotkey;
  try {
    hotkeyFail = globalShortcut.register(accelerator, showQuickWindow) ? null : { key: msg("Another app is using {key}"), accelerator };
  } catch (e) {
    hotkeyFail = { key: msg("{key} can't be used as a hotkey"), accelerator };
  }
  if (hotkeyFail) console.error(`[hotkey] ${translate("en", hotkeyFail.key, { key: accelerator })}`);
}

// 새 버전이 있으면 메뉴바(트레이) 메뉴에 한 줄. 맥은 받기, 윈도우는 다 받았으면 다시 켜기.
function updateMenuItems(): Electron.MenuItemConstructorOptions[] {
  const s = updater?.state;
  if (s?.status === "available") return [{ type: "separator" }, { label: tr("Get version {v}…", { v: s.version }), click: () => openOutside(s.url, () => shell.openExternal(s.url)) }];
  if (s?.status === "ready") return [{ type: "separator" }, { label: tr("Restart to update to {v}", { v: s.version }), click: () => updater.install() }];
  return [];
}

function trayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: tr("Capture"), accelerator: data.settings.hotkey, click: showQuickWindow },
    { label: tr("Today"), click: toggleListWindow },
    { label: tr("Settings…"), accelerator: "CmdOrCtrl+,", click: () => showSettings() },
    ...updateMenuItems(),
    ...(hotkeyFail ? [{ type: "separator" as const }, { label: hotkeyError()!, enabled: false }] : []),
    { type: "separator" },
    { label: tr("Quit todoBAN"), role: "quit" },
  ]);
}

// 로그인 안내에서 여는 터미널. 맥은 터미널 앱, 윈도우는 명령 프롬프트.
function openTerminal(): void {
  if (IS_WIN) openOutside("Terminal", () => void shell.openPath(process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe"));
  else openOutside("Terminal", () => shell.openPath("/System/Applications/Utilities/Terminal.app"));
}

// 한 번만 뜬다. 다시 실행하면 새로 띄우지 않고 떠 있는 앱의 목록을 연다(트레이 아이콘이 둘 생기지 않게).
// 자동 점검·화면 확인용 실행은 각자 데이터 폴더를 쓰므로 막지 않는다.
if (!process.env.TODOBAN_USER_DATA && !app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (listWindow && !listWindow.isVisible()) toggleListWindow();
});

app.whenReady().then(() => {
  app.dock?.hide();
  data = loadData();
  // 자동 점검(E2E)의 시나리오는 영어 문구로 화면을 찾는다. TODOBAN_LANG=ko로 한국어 화면도 점검한다.
  if (E2E) data.settings.language = process.env.TODOBAN_LANG === "ko" ? "ko" : "en";
  // 규칙 파일(CLAUDE.md)을 시작할 때 최신으로 맞춘다. 첫 Claude 호출까지 미루면 그 전에 연 화면이 예전 규칙을 쓴다.
  ensureWorkDir();

  ipcMain.handle("data:get", () => data);
  ipcMain.handle("todo:action", (_e, action: TodoAction) => act(action));
  // 할 일 줄의 ⋯ 버튼과 오른쪽 클릭 메뉴. 고치기와 지우기는 목록 창이 처리한다(제자리 편집, 되살리기 안내).
  ipcMain.handle("todo:menu", (_e, id: string) => {
    const t = data.todos.find((x) => x.id === id);
    if (!t || !listWindow) return [];
    const today = localDate();
    const tomorrow = addDays(today, 1);
    const send = (channel: string) => listWindow?.webContents.send(channel, id);
    const items: Electron.MenuItemConstructorOptions[] = [
      { label: tr("Edit title"), accelerator: "CommandOrControl+E", registerAccelerator: false, click: () => send("todo:requestEdit") },
      { type: "separator" },
      { label: tr("Move to Today"), enabled: !t.completedAt && !(t.plannedDate !== null && t.plannedDate <= today), click: () => act({ type: "moveToToday", id }) },
      { label: tr("Move to Tomorrow"), enabled: !t.completedAt && t.plannedDate !== tomorrow, click: () => act({ type: "schedule", id, plannedDate: tomorrow }) },
      { label: tr("Move to Later"), enabled: !t.completedAt && t.plannedDate !== null, click: () => act({ type: "schedule", id, plannedDate: null }) },
      {
        label: t.dueDate ? `${tr("Deadline")} · ${t.dueDate.slice(5).replace("-", "/")}` : tr("Deadline"),
        enabled: !t.completedAt,
        submenu: [
          ...deadlineOptions(today, data.settings.language).map((o) => ({
            label: o.label,
            type: "checkbox" as const,
            checked: t.dueDate === o.date,
            click: () => act({ type: "setDue", id, dueDate: o.date }),
          })),
          { type: "separator" as const },
          { label: tr("Pick a date…"), accelerator: "CommandOrControl+D", registerAccelerator: false, click: () => send("todo:requestDue") },
          ...(t.dueDate ? [{ label: tr("Clear deadline"), click: () => act({ type: "setDue", id, dueDate: null }) }] : []),
        ],
      },
      { type: "separator" },
      { label: tr("Delete"), accelerator: "CommandOrControl+Backspace", registerAccelerator: false, click: () => send("todo:requestDelete") },
    ];
    if (!E2E) Menu.buildFromTemplate(items).popup({ window: listWindow });
    return items
      .filter((i) => i.label)
      .map((i) => `${i.label}${i.enabled === false ? " (off)" : ""}${Array.isArray(i.submenu) ? ` [${i.submenu.filter((x) => x.label).map((x) => x.label).join(" | ")}]` : ""}`);
  });

  // 렌더러가 내용 높이를 알려 주면 창 높이를 맞춘다. 창 밖의 투명한 영역이 클릭을 가로채지 않게 하려는 것.
  ipcMain.on("list:resize", (_e, height: number) => fitHeight(listWindow, height, LIST_MAX_HEIGHT));
  // 카드 높이가 움직이는 동안(ms) 창 그림자를 프레임마다 다시 계산한다. 안 하면 시작할 때의 모양으로 그림자가 남는다.
  ipcMain.on("list:animating", (_e, ms: number) => followShadow(listWindow, ms));
  // Esc: 고정했으면 닫지 않고 그대로 둔다(닫기는 메뉴바 아이콘이나 고정 풀기로).
  ipcMain.on("list:hide", () => hideLooseList());
  ipcMain.on("list:pin", (_e, pinned: boolean) => {
    const b = listWindow?.getBounds();
    act({ type: "setSettings", patch: { listPin: { pinned, x: pinned ? (b?.x ?? null) : null, y: pinned ? (b?.y ?? null) : null } } });
    applyListPin();
    listWindow?.invalidateShadow?.();
  });
  ipcMain.on("quick:resize", (_e, height: number) => fitHeight(quickWindow, height, QUICK_MAX_HEIGHT));
  ipcMain.on("quick:hide", () => quickWindow?.hide());

  // 한 줄 30자 이하는 그대로 넣고, 긴 입력은 확인 창을 열어 Claude에게 나눠 달라고 한다.
  ipcMain.handle("quick:submit", (_e, text: string) => submitQuick(text));

  updater = new Updater((s) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send("update:changed", s);
  });
  ipcMain.handle("update:get", () => updater.state);
  ipcMain.on("update:check", () => void updater.check());
  ipcMain.on("update:download", () => {
    const s = updater.state;
    if (s.status === "available") openOutside(s.url, () => shell.openExternal(s.url));
  });
  ipcMain.on("update:install", () => updater.install());
  updater.start();

  firstSteps = new FirstStepManager(
    () => data,
    (all) => {
      listWindow?.webContents.send("firstStep:states", all);
      const st = all[0];
      if (DEMO_SHAPE_GO && st && st.status !== "loading") return void setTimeout(() => snapshotAndQuit(listWindow), 1200);
      if (!DEMO_FIRSTSTEP || !st || st.status === "loading") return;
      if (st.status === "question" && DEMO_ANSWER && !st.answer) setTimeout(() => firstSteps.request(st.todoId, { answer: DEMO_ANSWER }), 1500);
      else setTimeout(() => snapshotAndQuit(listWindow), 800);
    },
  );
  ipcMain.handle("firstStep:get", () => firstSteps.all());
  ipcMain.on("firstStep:request", (_e, id: string, opts: { answer?: string; again?: boolean; shape?: ShapeInput }) => firstSteps.request(id, opts));
  ipcMain.on("firstStep:dismiss", (_e, id: string) => firstSteps.dismiss(id));
  ipcMain.on("firstStep:accept", (_e, id: string, opts: { toToday?: boolean } = {}) => {
    const st = firstSteps.all().find((s) => s.todoId === id);
    if (st?.status === "suggestion" && st.title) act({ type: "applyFirstStep", id, title: st.title, shortcutId: st.shortcutId, toToday: opts.toToday });
    firstSteps.dismiss(id);
  });

  // 빚기(C1): 켜 둔 LOCAL 도구에서 낱말에 맞는 자료를 하나씩 찾는다.
  // 렌더러가 열 수 있는 파일은 여기서 찾아 준 경로뿐이다.
  const openablePaths = new Set<string>();
  ipcMain.handle("tools:collect", async (_e, todoId: string, words: string[]) => {
    const todo = data.todos.find((t) => t.id === todoId);
    if (!todo) return [];
    const results = await collectLocal(todo, words, data);
    for (const r of results) if (r.item?.open?.kind === "file") openablePaths.add(r.item.open.path);
    return results;
  });
  // MCP 도구는 서비스마다 따로 읽는다. 같은 할 일·서비스의 이전 요청은 취소한다.
  const mcpAborts = new Map<string, AbortController>();
  ipcMain.handle("tools:collectMcp", async (_e, todoId: string, source: McpSource, words: string[]) => {
    const todo = data.todos.find((t) => t.id === todoId);
    if (!todo || !data.settings.tools.mcp[source]) return { source, status: "empty", item: null };
    const key = `${todoId}:${source}`;
    mcpAborts.get(key)?.abort();
    const abort = new AbortController();
    mcpAborts.set(key, abort);
    const r = await collectMcp(source, todo, words, data, abort.signal);
    if (r.status === "needs-auth") markNeedsAuth(source);
    return r;
  });
  ipcMain.on("tools:cancelMcp", (_e, todoId: string) => {
    for (const [key, a] of mcpAborts) if (key.startsWith(`${todoId}:`)) a.abort();
  });
  ipcMain.handle("tools:mcpStatus", (_e, fresh?: boolean) => mcpStatus(data.settings.claudePath, fresh));
  // 켤 때 연결된 워크스페이스·계정을 확인하고 저장한다. 도구 탭과 빚기 카드에 보여 준다.
  ipcMain.handle("tools:verifyMcp", async (_e, source: McpSource) => {
    const r = await verifyMcp(source, data);
    if (r.ok) {
      const tools = data.settings.tools;
      act({
        type: "setSettings",
        patch: { tools: { ...tools, mcpInfo: { ...tools.mcpInfo, [source]: { workspace: r.workspace, account: r.account, checkedAt: new Date().toISOString() } } } },
      });
    }
    return r;
  });
  ipcMain.on("tools:openMcpGuide", (_e, kind: "terminal" | "connectors" = "terminal") =>
    kind === "connectors"
      ? openOutside("claude.ai connectors", () => shell.openExternal("https://claude.ai/settings/connectors"))
      : openTerminal(),
  );
  // 파일 미리보기(Quick Look). 열 수 있는 파일과 같은 범위만.
  ipcMain.on("tools:quicklook", (_e, path: string) => {
    if (!openablePaths.has(path) && !data.todos.some((t) => t.context.some((n) => n.path === path))) return;
    // 윈도우에는 훑어보기가 없어서 파일을 연다
    openOutside(`Quick Look ${path}`, () => (IS_MAC ? execFile("/usr/bin/qlmanage", ["-p", path], () => {}) : void shell.openPath(path)));
  });
  ipcMain.on("tools:open", (_e, open: ToolItem["open"]) => {
    if (!open) return;
    hideLooseList();
    if (open.kind === "url") {
      const url = safeServiceUrl(open.source, open.url);
      if (url) openOutside(url, () => shell.openExternal(url));
    } else if (open.kind === "shortcut") {
      const s = data.shortcuts.find((x) => x.id === open.id);
      if (s) openOutside(s.url, () => openShortcut(s));
    } else if (open.kind === "figma") {
      // 피그마 링크만 피그마 앱으로 연다(없으면 브라우저).
      const url = safeServiceUrl("frame", open.url);
      if (url) openOutside(url, () => openShortcut({ id: "", name: "", keywords: [], url, appBundleId: FIGMA_BUNDLE_ID }));
    } else if (open.kind === "file" && (openablePaths.has(open.path) || data.todos.some((t) => t.context.some((n) => n.path === open.path))))
      // 열 수 있는 파일은 Files 도구가 찾아 준 경로와, 할 일에 붙여 둔 경로뿐이다.
      openOutside(open.path, () => shell.openPath(open.path));
    else if (open.kind === "calendar" && IS_MAC) openOutside("Calendar", () => shell.openPath("/System/Applications/Calendar.app"));
  });

  ipcMain.on("settings:open", (_e, tab?: "general" | "tools" | "shortcuts") => showSettings(tab));
  ipcMain.on("welcome:resize", (_e, height: number) => {
    if (!welcomeWindow) return;
    const h = Math.min(Math.max(Math.ceil(height), 360), 760);
    const [w, cur] = welcomeWindow.getContentSize();
    if (cur !== h) resizeAnimated(welcomeWindow, w ?? 480, h);
  });
  ipcMain.on("welcome:finish", (_e, openList: boolean) => {
    act({ type: "setSettings", patch: { welcomed: true } });
    welcomeWindow?.close();
    if (openList && !HEADLESS) toggleListWindow();
  });
  ipcMain.on("welcome:installGuide", () => openOutside("Claude Code install guide", () => shell.openExternal("https://docs.claude.com/en/docs/claude-code/setup")));
  ipcMain.handle("welcome:chooseClaude", async () => {
    if (E2E) return null;
    const r = await dialog.showOpenDialog({ title: tr("Choose the claude executable"), properties: ["openFile", "showHiddenFiles"], defaultPath: join(app.getPath("home"), ".local/bin") });
    const path = r.canceled ? null : (r.filePaths[0] ?? null);
    if (path) act({ type: "setSettings", patch: { claudePath: path } });
    return path;
  });
  // 내용 높이에 맞추되 화면 아래(여백 포함)를 넘지 않는다. 넘는 만큼은 창 안에서 스크롤한다.
  ipcMain.on("settings:resize", (_e, height: number) => {
    const win = settingsWindow;
    if (!win) return;
    const b = win.getContentBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    const room = wa.y + wa.height - SCREEN_GAP - b.y;
    const h = Math.min(Math.max(Math.ceil(height), 300), SETTINGS_MAX, Math.max(room, 300));
    if (b.height !== h) resizeAnimated(win, b.width, h);
  });
  ipcMain.handle("settings:hotkeyStatus", () => hotkeyError());
  ipcMain.handle("settings:claudeInfo", async () => {
    const found = await findClaude(data.settings.claudePath);
    if (!found.path) return { ...found, version: null, auth: null };
    const [version, auth] = await Promise.all([claudeVersion(found.path), claudeAuth(found.path)]);
    return { ...found, version, auth };
  });
  ipcMain.handle("settings:rulesStatus", () => rulesStatus());
  ipcMain.handle("settings:resetRules", () => {
    resetRules();
    return rulesStatus();
  });
  ipcMain.on("settings:openRules", () => openOutside("CLAUDE.md", () => shell.openPath(join(ensureWorkDir(), "CLAUDE.md"))));
  // 단축키를 녹화하는 동안에는 지금 단축키가 눌려도 입력창이 뜨지 않게 잠시 풀어 둔다.
  ipcMain.on("settings:pauseHotkey", (_e, paused: boolean) => (paused ? globalShortcut.unregisterAll() : registerHotkey()));
  ipcMain.handle("shortcut:open", async (_e, id: string) => {
    const s = data.shortcuts.find((x) => x.id === id);
    if (!s) return null;
    hideLooseList();
    if (E2E) return void openOutside(s.url, () => {});
    return openShortcut(s);
  });

  ipcMain.handle("review:get", () => review?.state ?? null);
  ipcMain.on("review:retry", () => review?.split());
  ipcMain.on("review:cancel", () => cancelReview());
  ipcMain.on("review:resize", (_e, height: number) => {
    if (!reviewWindow) return;
    const h = Math.min(Math.max(Math.ceil(height), 200), REVIEW_MAX_HEIGHT);
    const [w, cur] = reviewWindow.getContentSize();
    if (cur !== h) resizeAnimated(reviewWindow, w ?? REVIEW_WIDTH, h);
  });
  ipcMain.on("review:commit", (_e, drafts: ReviewDraft[]) => {
    if (!review) return;
    const rawText = review.state.rawText;
    endReview();
    addAndReveal({ type: "addMany", rawText, items: drafts });
  });
  // 나누지 않고 원문 첫 줄을 제목으로 한 정리 안 된 할 일 하나로 넣는다.
  ipcMain.on("review:insertRaw", () => {
    if (!review) return;
    const rawText = review.state.rawText;
    endReview();
    addAndReveal({ type: "add", title: firstLine(rawText), rawText });
  });
  ipcMain.on("review:openTerminal", () => openTerminal());

  // 화면 확인용 실행에서는 메뉴바 아이콘과 전역 단축키를 만들지 않는다.
  // 만들면 쓰고 있는 todoBAN과 겹쳐서, 사용자의 입력이 확인용 앱으로 들어간다.
  if (!HEADLESS) {
    // 맥은 메뉴바 색을 따르는 템플릿 아이콘, 윈도우는 밝은·어두운 작업 표시줄 모두에서 보이는 색 아이콘.
    // 배포한 앱에서도 찾도록 resourcePath로 읽는다.
    const icon = nativeImage.createFromPath(resourcePath(IS_MAC ? "trayTemplate.png" : "tray-win.png"));
    if (IS_MAC) icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip("todoBAN");
    tray.on("click", toggleListWindow);
    tray.on("right-click", () => tray?.popUpContextMenu(trayMenu()));
  }

  listWindow = createPopupWindow("list", LIST_WIDTH, 480);
  // 고정한 창을 옮기면 그 자리를 기억한다.
  listWindow.on("moved", () => {
    if (!listPinned() || !listWindow) return;
    const { x, y } = listWindow.getBounds();
    act({ type: "setSettings", patch: { listPin: { pinned: true, x, y } } });
  });
  quickWindow = createPopupWindow("quick", QUICK_WIDTH, 160);
  reviewWindow = createReviewWindow();
  registerHotkey();
  updateTray();
  // 날짜가 바뀌면 메뉴바 숫자와 목록을 다시 계산한다.
  let lastDay = localDate();
  setInterval(() => {
    if (localDate() === lastDay) return;
    lastDay = localDate();
    broadcast();
  }, 60_000);

  if (SHOW_ON_START === "list" || SHOW_ON_START === "1") listWindow.once("ready-to-show", toggleListWindow);
  if (SHOW_ON_START === "quick") quickWindow.once("ready-to-show", showQuickWindow);

  if (DEMO_SETTINGS) showSettings(DEMO_SETTINGS);
  if (SNAPSHOT && process.env.TODOBAN_SNAPSHOT_VIEW === "list")
    listWindow.webContents.once("did-finish-load", () => setTimeout(() => snapshotAndQuit(listWindow), 1500));
  if (SNAPSHOT && process.env.TODOBAN_SNAPSHOT_VIEW === "quick")
    quickWindow.webContents.once("did-finish-load", () => setTimeout(() => snapshotAndQuit(quickWindow), 1500));
  if (DEMO_QUICK)
    listWindow.webContents.once("did-finish-load", () => {
      submitQuick(DEMO_QUICK);
      setTimeout(() => snapshotAndQuit(listWindow), 1500);
    });

  if (DEMO_SHAPE) {
    const t = data.todos.find((x) => x.title === DEMO_SHAPE);
    if (t)
      listWindow.webContents.once("did-finish-load", () =>
        setTimeout(() => {
          listWindow?.webContents.send("shape:open", t.id, DEMO_SHAPE_GO);
          if (!DEMO_SHAPE_GO) setTimeout(() => snapshotAndQuit(listWindow), 1800);
        }, 600),
      );
  }

  if (DEMO_FIRSTSTEP) {
    const t = data.todos.find((x) => x.title === DEMO_FIRSTSTEP);
    if (t) listWindow.webContents.once("did-finish-load", () => setTimeout(() => firstSteps.request(t.id), 500));
  }

  if (E2E) {
    const windows = { list: () => listWindow, quick: () => quickWindow, review: () => reviewWindow, settings: () => settingsWindow, welcome: () => welcomeWindow };
    listWindow.webContents.once("did-finish-load", () =>
      setTimeout(async () => {
        // 성능 측정: 실제로 그려야 프레임을 잴 수 있으므로 포커스 없이 띄운다.
        // 화면 밖(왼쪽)에 두어 쓰고 있는 화면을 가리지 않고, 마우스나 다른 창이 측정에 섞이지 않게 한다.
        if (PERF && listWindow) {
          listWindow.setPosition(-listWindow.getBounds().width - 400, 40);
          listWindow.showInactive();
          ipcMain.handle("perf:main", () => perfLog.splice(0));
          // 프로세스별 CPU 사용률(직전 호출 이후 평균). GPU 프로세스가 글로우 같은 합성 비용을 보여 준다.
          ipcMain.handle("perf:metrics", () => app.getAppMetrics().map((m) => ({ type: m.type, cpu: Number(m.cpu.percentCPUUsage.toFixed(1)) })));
          // 그림자까지 포함해 창을 찍는다(macOS screencapture -l).
          ipcMain.handle("perf:capture", (_e, file: string) => {
            const id = listWindow!.getMediaSourceId().split(":")[1]!;
            return new Promise((r) => execFile("/usr/sbin/screencapture", ["-x", "-l", id, file], () => r(true)));
          });
        }
        const out = process.env.TODOBAN_E2E_OUT ?? join(app.getPath("userData"), "e2e");
        await runE2E(E2E, out, {
          window: (w) => windows[w](),
          main: async (action) => {
            const colon = action.indexOf(":");
            const kind = colon < 0 ? action : action.slice(0, colon);
            const arg = colon < 0 ? "" : action.slice(colon + 1);
            if (kind === "openList") {
              listWindow?.webContents.send("list:opened");
              maybePrefetch();
            }
            else if (kind === "openSettings") {
              showSettings(arg as "general");
              // 설정 창이 처음 만들어지면 내용을 다 그릴 때까지 기다린다.
              await new Promise((r) => setTimeout(r, 1500));
            } else if (kind === "shape") {
              // "shape:*"는 오늘 목록의 첫 정리 안 된 할 일
              const today = localDate();
              // "shape:@context"는 자료가 붙은 첫 할 일
              const t =
                arg === "*"
                  ? todayView(data.todos, today).open.find((x) => !x.isClear)
                  : arg === "@context"
                    ? data.todos.find((x) => x.context.length > 0)
                    : data.todos.find((x) => x.title === arg);
              if (!t) throw new Error(`할 일 없음: ${arg}`);
              listWindow?.webContents.send("shape:open", t.id, false);
            } else throw new Error(`모르는 동작: ${action}`);
          },
        });
        quitting = true;
        app.quit();
      }, 800),
    );
  }

  if (!data.settings.welcomed && !SNAPSHOT && !WINDOW_SHOT) showWelcome();

  if (WINDOW_SHOT) {
    const shot = async (win: BrowserWindow, name: string) => {
      const { width, height } = win.getBounds();
      win.setBounds({ x: -width - 400, y: 120, width, height });
      win.showInactive();
      win.invalidateShadow?.();
      await new Promise((r) => setTimeout(r, 900));
      const id = win.getMediaSourceId().split(":")[1]!;
      await new Promise((r) => execFile("/usr/sbin/screencapture", ["-x", "-l", id, join(WINDOW_SHOT, `${name}.png`)], r));
      console.log(`[shot] ${name} bounds=${JSON.stringify(win.getBounds())}`);
      win.hide();
    };
    listWindow.webContents.once("did-finish-load", () =>
      setTimeout(async () => {
        listWindow?.webContents.send("list:opened");
        await new Promise((r) => setTimeout(r, 600));
        await shot(listWindow!, "list");
        await shot(quickWindow!, "quick");
        quitting = true;
        app.quit();
      }, 1200),
    );
  }

  // 지난번에 넣거나 취소하지 못한 빠른 입력이 있으면 확인 창을 다시 연다.
  const pending = loadPending();
  if (pending) reviewWindow.once("ready-to-show", () => startReview(pending));
});

app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("window-all-closed", () => {
  // 메뉴바 앱이라 창을 모두 닫아도 종료하지 않는다.
});
