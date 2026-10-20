import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import type { AppData, TodoAction } from "@shared/types";
import { applyAction, localDate, pendingCarryOver, todayView } from "@shared/todos";
import { classifyQuickInput, firstLine, matchShortcutByKeywords } from "@shared/quickInput";
import { loadData, saveData } from "./store";
import type { ReviewDraft } from "@shared/review";
import { ReviewSession, clearPending, loadPending, savePending } from "./review";
import { FirstStepManager } from "./firstStep";
import { openShortcut } from "./shortcutOpener";
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
const DEMO_SETTINGS = process.env.TODOBAN_SETTINGS_TAB as "general" | "shortcuts" | "shortcuts-new" | undefined;

async function snapshotAndQuit(win: BrowserWindow | null): Promise<void> {
  if (!SNAPSHOT || !win) return;
  const img = await win.webContents.capturePage();
  writeFileSync(SNAPSHOT, img.toPNG());
  quitting = true;
  app.quit();
}

// 투명한 창 안에 카드와 그림자를 CSS로 그리므로, 그림자 여백만큼 창이 카드보다 크다.
const LIST_WIDTH = 380;
const LIST_MAX_HEIGHT = 640;
const QUICK_WIDTH = 680;
const QUICK_MAX_HEIGHT = 260;
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
    hasShadow: false,
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
  if (b.height !== h) win.setBounds({ ...b, height: h });
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
    title: "할 일 확인",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#ffffff",
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
  if (reviewWindow && !SNAPSHOT) {
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

function showSettings(tab: "general" | "shortcuts" | "shortcuts-new" = "general"): void {
  listWindow?.hide();
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = new BrowserWindow({
      width: 560,
      height: 520,
      useContentSize: true,
      show: false,
      title: "설정",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 },
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: "#ffffff",
      webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true },
    });
    loadView(settingsWindow, `settings-${tab}`);
    settingsWindow.once("ready-to-show", () => {
      if (SNAPSHOT) {
        setTimeout(() => snapshotAndQuit(settingsWindow), 1500);
        return;
      }
      app.focus({ steal: true });
      settingsWindow?.show();
    });
    settingsWindow.on("closed", () => (settingsWindow = null));
    return;
  }
  settingsWindow.webContents.send("settings:tab", tab === "shortcuts-new" ? "shortcuts" : tab);
  app.focus({ steal: true });
  settingsWindow.show();
  settingsWindow.focus();
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
  globalShortcut.unregisterAll();
  const accelerator = data.settings.hotkey;
  try {
    hotkeyError = globalShortcut.register(accelerator, showQuickWindow) ? null : `${accelerator}을(를) 다른 앱이 쓰고 있어요`;
  } catch (e) {
    hotkeyError = `${accelerator}은(는) 쓸 수 없는 단축키예요`;
  }
  if (hotkeyError) console.error(`[hotkey] ${hotkeyError}`);
}

function trayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: "빠른 입력", accelerator: data.settings.hotkey, click: showQuickWindow },
    { label: "오늘 목록", click: toggleListWindow },
    { label: "설정…", accelerator: "Command+,", click: () => showSettings() },
    ...(hotkeyError ? [{ type: "separator" as const }, { label: hotkeyError, enabled: false }] : []),
    { type: "separator" },
    { label: "todoBAN 종료", role: "quit" },
  ]);
}

app.whenReady().then(() => {
  app.dock?.hide();
  data = loadData();

  ipcMain.handle("data:get", () => data);
  ipcMain.handle("todo:action", (_e, action: TodoAction) => act(action));

  // 렌더러가 내용 높이를 알려 주면 창 높이를 맞춘다. 창 밖의 투명한 영역이 클릭을 가로채지 않게 하려는 것.
  ipcMain.on("list:resize", (_e, height: number) => fitHeight(listWindow, height, LIST_MAX_HEIGHT));
  ipcMain.on("list:hide", () => listWindow?.hide());
  ipcMain.on("quick:resize", (_e, height: number) => fitHeight(quickWindow, height, QUICK_MAX_HEIGHT));
  ipcMain.on("quick:hide", () => quickWindow?.hide());

  // 한 줄 30자 이하는 그대로 넣고, 긴 입력은 확인 창을 열어 Claude에게 나눠 달라고 한다.
  ipcMain.handle("quick:submit", (_e, text: string) => submitQuick(text));

  firstSteps = new FirstStepManager(
    () => data,
    (all) => {
      listWindow?.webContents.send("firstStep:states", all);
      const st = all[0];
      if (!DEMO_FIRSTSTEP || !st || st.status === "loading") return;
      if (st.status === "question" && DEMO_ANSWER && !st.answer) setTimeout(() => firstSteps.request(st.todoId, { answer: DEMO_ANSWER }), 1500);
      else setTimeout(() => snapshotAndQuit(listWindow), 800);
    },
  );
  ipcMain.handle("firstStep:get", () => firstSteps.all());
  ipcMain.on("firstStep:request", (_e, id: string, opts: { answer?: string; again?: boolean }) => firstSteps.request(id, opts));
  ipcMain.on("firstStep:dismiss", (_e, id: string) => firstSteps.dismiss(id));
  ipcMain.on("firstStep:accept", (_e, id: string) => {
    const st = firstSteps.all().find((s) => s.todoId === id);
    if (st?.status === "suggestion" && st.title) act({ type: "applyFirstStep", id, title: st.title, shortcutId: st.shortcutId });
    firstSteps.dismiss(id);
  });

  ipcMain.on("settings:open", (_e, tab?: "general" | "shortcuts") => showSettings(tab));
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
  ipcMain.on("settings:openRules", () => shell.openPath(join(ensureWorkDir(), "CLAUDE.md")));
  // 단축키를 녹화하는 동안에는 지금 단축키가 눌려도 입력창이 뜨지 않게 잠시 풀어 둔다.
  ipcMain.on("settings:pauseHotkey", (_e, paused: boolean) => (paused ? globalShortcut.unregisterAll() : registerHotkey()));
  ipcMain.handle("shortcut:open", async (_e, id: string) => {
    const s = data.shortcuts.find((x) => x.id === id);
    if (!s) return null;
    listWindow?.hide();
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
  ipcMain.on("review:openTerminal", () => shell.openPath("/System/Applications/Utilities/Terminal.app"));

  const icon = nativeImage.createFromPath(join(__dirname, "../../resources/trayTemplate.png"));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("todoBAN");
  tray.on("click", toggleListWindow);
  tray.on("right-click", () => tray?.popUpContextMenu(trayMenu()));

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
  if (DEMO_QUICK)
    listWindow.webContents.once("did-finish-load", () => {
      submitQuick(DEMO_QUICK);
      setTimeout(() => snapshotAndQuit(listWindow), 1500);
    });

  if (DEMO_FIRSTSTEP) {
    const t = data.todos.find((x) => x.title === DEMO_FIRSTSTEP);
    if (t) listWindow.webContents.once("did-finish-load", () => setTimeout(() => firstSteps.request(t.id), 500));
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
