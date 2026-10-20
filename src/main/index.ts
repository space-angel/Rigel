import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import type { AppData, TodoAction } from "@shared/types";
import { applyAction, localDate, pendingCarryOver, todayView } from "@shared/todos";
import { addDays } from "@shared/dial";
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
import { claudeVersion, ensureWorkDir, findClaude } from "./claude/setup";

app.setName("todoBAN");
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
let hotkeyError: string | null = null;

function updateTray(): void {
  const today = localDate();
  const { open } = todayView(data.todos, today, pendingCarryOver(data, today));
  tray?.setTitle(open.length ? ` ${open.length}` : "", { fontType: "monospacedDigit" });
}

function broadcast(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("data:changed", data);
  updateTray();
}

function act(action: TodoAction): AppData {
  const prevHotkey = data.settings.hotkey;
  const prevLogin = data.settings.openAtLogin;
  data = applyAction(data, action);
  saveData(data);
  if (data.settings.hotkey !== prevHotkey) registerHotkey();
  if (data.settings.openAtLogin !== prevLogin) app.setLoginItemSettings({ openAtLogin: data.settings.openAtLogin });
  broadcast();
  return data;
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
    if (!KEEP_OPEN && !win.webContents.isDevToolsOpened()) win.hide();
  });
  loadView(win, view);
  return win;
}

function fitHeight(win: BrowserWindow | null, height: number, max: number): void {
  if (!win) return;
  const h = Math.min(Math.max(Math.ceil(height), 80), max);
  const b = win.getBounds();
  if (b.height === h) return;
  win.setBounds({ ...b, height: h });
  // 투명 창의 그림자는 모양이 바뀌면 다시 계산해야 이전 크기의 그림자가 남지 않는다.
  win.invalidateShadow();
}

function positionListWindow(): void {
  if (!tray || !listWindow) return;
  const t = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: t.x, y: t.y });
  const { width } = listWindow.getBounds();
  const area = display.workArea;
  const x = Math.round(Math.min(Math.max(t.x + t.width / 2 - width / 2, area.x + 8), area.x + area.width - width - 8));
  listWindow.setPosition(x, Math.round(t.y + t.height + 2));
}

function toggleListWindow(): void {
  if (!listWindow) return;
  if (listWindow.isVisible()) {
    listWindow.hide();
    return;
  }
  quickWindow?.hide();
  positionListWindow();
  listWindow.show();
  listWindow.invalidateShadow();
  listWindow.focus();
  listWindow.webContents.send("list:opened");
}

// 빠른 입력창은 마우스가 있는 화면의 가운데보다 조금 위에 띄운다.
function showQuickWindow(): void {
  if (!quickWindow) return;
  if (quickWindow.isVisible()) {
    quickWindow.hide();
    return;
  }
  listWindow?.hide();
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const { width } = quickWindow.getBounds();
  quickWindow.setPosition(Math.round(area.x + (area.width - width) / 2), Math.round(area.y + area.height * 0.22));
  app.focus({ steal: true });
  quickWindow.show();
  quickWindow.invalidateShadow();
  quickWindow.focus();
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
    title: "Review",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
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

function showSettings(tab: "general" | "tools" | "shortcuts" | "shortcuts-new" = "general"): void {
  listWindow?.hide();
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = new BrowserWindow({
      width: 560,
      height: 520,
      useContentSize: true,
      show: false,
      title: "Settings",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 },
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
    title: "Welcome",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
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

// 한 줄 30자 이하는 그대로 넣고(부르는 말이 있으면 바로가기 연결), 긴 입력은 확인 창에서 Claude에게 나눠 달라고 한다.
function submitQuick(text: string): { ok: boolean; kind?: "short" | "long" } {
  const kind = classifyQuickInput(text);
  if (kind === "empty") return { ok: false };
  quickWindow?.hide();
  if (kind === "short") act({ type: "add", title: text.trim(), rawText: text, shortcutId: matchShortcutByKeywords(text, data.shortcuts) });
  else startReview(text);
  return { ok: true, kind };
}

function registerHotkey(): void {
  if (HEADLESS) return;
  globalShortcut.unregisterAll();
  const accelerator = data.settings.hotkey;
  try {
    hotkeyError = globalShortcut.register(accelerator, showQuickWindow) ? null : `Another app is using ${accelerator}`;
  } catch (e) {
    hotkeyError = `${accelerator} can't be used as a hotkey`;
  }
  if (hotkeyError) console.error(`[hotkey] ${hotkeyError}`);
}

function trayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: "Capture", accelerator: data.settings.hotkey, click: showQuickWindow },
    { label: "Today", click: toggleListWindow },
    { label: "Settings…", accelerator: "Command+,", click: () => showSettings() },
    ...(hotkeyError ? [{ type: "separator" as const }, { label: hotkeyError, enabled: false }] : []),
    { type: "separator" },
    { label: "Quit todoBAN", role: "quit" },
  ]);
}

app.whenReady().then(() => {
  app.dock?.hide();
  data = loadData();

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
      { label: "Edit title", accelerator: "CommandOrControl+E", registerAccelerator: false, click: () => send("todo:requestEdit") },
      { type: "separator" },
      { label: "Move to Today", enabled: !t.completedAt && !(t.plannedDate !== null && t.plannedDate <= today), click: () => act({ type: "moveToToday", id }) },
      { label: "Move to Tomorrow", enabled: !t.completedAt && t.plannedDate !== tomorrow, click: () => act({ type: "schedule", id, plannedDate: tomorrow }) },
      { label: "Move to Later", enabled: !t.completedAt && t.plannedDate !== null, click: () => act({ type: "schedule", id, plannedDate: null }) },
      { type: "separator" },
      { label: "Delete", accelerator: "CommandOrControl+Backspace", registerAccelerator: false, click: () => send("todo:requestDelete") },
    ];
    if (!E2E) Menu.buildFromTemplate(items).popup({ window: listWindow });
    return items.filter((i) => i.label).map((i) => `${i.label}${i.enabled === false ? " (off)" : ""}`);
  });

  // 렌더러가 내용 높이를 알려 주면 창 높이를 맞춘다. 창 밖의 투명한 영역이 클릭을 가로채지 않게 하려는 것.
  ipcMain.on("list:resize", (_e, height: number) => fitHeight(listWindow, height, LIST_MAX_HEIGHT));
  ipcMain.on("list:hide", () => listWindow?.hide());
  ipcMain.on("quick:resize", (_e, height: number) => fitHeight(quickWindow, height, QUICK_MAX_HEIGHT));
  ipcMain.on("quick:hide", () => quickWindow?.hide());

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
    title: "Welcome",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
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

// 한 줄 30자 이하는 그대로 넣고, 긴 입력은 확인 창을 열어 Claude에게 나눠 달라고 한다.
  ipcMain.handle("quick:submit", (_e, text: string) => submitQuick(text));

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
      : openOutside("Terminal", () => shell.openPath("/System/Applications/Utilities/Terminal.app")),
  );
  ipcMain.on("tools:open", (_e, open: ToolItem["open"]) => {
    if (!open) return;
    listWindow?.hide();
    if (open.kind === "url") {
      const url = safeServiceUrl(open.source, open.url);
      if (url) openOutside(url, () => shell.openExternal(url));
    } else if (open.kind === "shortcut") {
      const s = data.shortcuts.find((x) => x.id === open.id);
      if (s) openOutside(s.url, () => openShortcut(s));
    } else if (open.kind === "file" && openablePaths.has(open.path)) openOutside(open.path, () => shell.openPath(open.path));
    else if (open.kind === "calendar") openOutside("Calendar", () => shell.openPath("/System/Applications/Calendar.app"));
  });

  ipcMain.on("settings:open", (_e, tab?: "general" | "tools" | "shortcuts") => showSettings(tab));
  ipcMain.on("welcome:resize", (_e, height: number) => {
    if (!welcomeWindow) return;
    const h = Math.min(Math.max(Math.ceil(height), 360), 760);
    const [w, cur] = welcomeWindow.getContentSize();
    if (cur !== h) welcomeWindow.setContentSize(w ?? 480, h);
  });
  ipcMain.on("welcome:finish", (_e, openList: boolean) => {
    act({ type: "setSettings", patch: { welcomed: true } });
    welcomeWindow?.close();
    if (openList && !HEADLESS) toggleListWindow();
  });
  ipcMain.on("welcome:installGuide", () => openOutside("Claude Code install guide", () => shell.openExternal("https://docs.claude.com/en/docs/claude-code/setup")));
  ipcMain.handle("welcome:chooseClaude", async () => {
    if (E2E) return null;
    const r = await dialog.showOpenDialog({ title: "Choose the claude executable", properties: ["openFile", "showHiddenFiles"], defaultPath: join(app.getPath("home"), ".local/bin") });
    const path = r.canceled ? null : (r.filePaths[0] ?? null);
    if (path) act({ type: "setSettings", patch: { claudePath: path } });
    return path;
  });
  ipcMain.on("settings:resize", (_e, height: number) => {
    if (!settingsWindow) return;
    const h = Math.min(Math.max(Math.ceil(height), 300), 760);
    const [w, cur] = settingsWindow.getContentSize();
    if (cur !== h) settingsWindow.setContentSize(w ?? 560, h);
  });
  ipcMain.handle("settings:hotkeyStatus", () => hotkeyError);
  ipcMain.handle("settings:claudeInfo", async () => {
    const found = await findClaude(data.settings.claudePath);
    return { ...found, version: found.path ? await claudeVersion(found.path) : null };
  });
  ipcMain.on("settings:openRules", () => openOutside("CLAUDE.md", () => shell.openPath(join(ensureWorkDir(), "CLAUDE.md"))));
  // 단축키를 녹화하는 동안에는 지금 단축키가 눌려도 입력창이 뜨지 않게 잠시 풀어 둔다.
  ipcMain.on("settings:pauseHotkey", (_e, paused: boolean) => (paused ? globalShortcut.unregisterAll() : registerHotkey()));
  ipcMain.handle("shortcut:open", async (_e, id: string) => {
    const s = data.shortcuts.find((x) => x.id === id);
    if (!s) return null;
    listWindow?.hide();
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
    if (cur !== h) reviewWindow.setContentSize(w ?? REVIEW_WIDTH, h);
  });
  ipcMain.on("review:commit", (_e, drafts: ReviewDraft[]) => {
    if (!review) return;
    act({ type: "addMany", rawText: review.state.rawText, items: drafts });
    endReview();
  });
  // 나누지 않고 원문 첫 줄을 제목으로 한 정리 안 된 할 일 하나로 넣는다.
  ipcMain.on("review:insertRaw", () => {
    if (!review) return;
    act({ type: "add", title: firstLine(review.state.rawText), rawText: review.state.rawText });
    endReview();
  });
  ipcMain.on("review:openTerminal", () => openOutside("Terminal", () => shell.openPath("/System/Applications/Utilities/Terminal.app")));

  // 화면 확인용 실행에서는 메뉴바 아이콘과 전역 단축키를 만들지 않는다.
  // 만들면 쓰고 있는 todoBAN과 겹쳐서, 사용자의 입력이 확인용 앱으로 들어간다.
  if (!HEADLESS) {
    const icon = nativeImage.createFromPath(join(__dirname, "../../resources/trayTemplate.png"));
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip("todoBAN");
    tray.on("click", toggleListWindow);
    tray.on("right-click", () => tray?.popUpContextMenu(trayMenu()));
  }

  listWindow = createPopupWindow("list", LIST_WIDTH, 480);
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
        const out = process.env.TODOBAN_E2E_OUT ?? join(app.getPath("userData"), "e2e");
        await runE2E(E2E, out, {
          window: (w) => windows[w](),
          main: async (action) => {
            const colon = action.indexOf(":");
            const kind = colon < 0 ? action : action.slice(0, colon);
            const arg = colon < 0 ? "" : action.slice(colon + 1);
            if (kind === "openList") listWindow?.webContents.send("list:opened");
            else if (kind === "openSettings") {
              showSettings(arg as "general");
              // 설정 창이 처음 만들어지면 내용을 다 그릴 때까지 기다린다.
              await new Promise((r) => setTimeout(r, 1500));
            } else if (kind === "shape") {
              // "shape:*"는 오늘 목록의 첫 정리 안 된 할 일
              const today = localDate();
              const t = arg === "*" ? todayView(data.todos, today).open.find((x) => !x.isClear) : data.todos.find((x) => x.title === arg);
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
      win.invalidateShadow();
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
