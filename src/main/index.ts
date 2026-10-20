import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import type { AppData, TodoAction } from "@shared/types";
import { applyAction, localDate, todayView } from "@shared/todos";
import { classifyQuickInput, firstLine } from "@shared/quickInput";
import { loadData, saveData } from "./store";
import type { ReviewDraft } from "@shared/review";
import { ReviewSession, clearPending, loadPending, savePending } from "./review";

app.setName("todoBAN");
// 개발 중 확인용: 실제 데이터 대신 다른 폴더를 쓰고, 실행하자마자 목록이나 빠른 입력창을 띄운다.
if (process.env.TODOBAN_USER_DATA) app.setPath("userData", process.env.TODOBAN_USER_DATA);
const SHOW_ON_START = process.env.TODOBAN_SHOW_ON_START; // "list" | "quick"
const KEEP_OPEN = process.env.TODOBAN_KEEP_OPEN === "1"; // 화면 확인용: 포커스를 잃어도 닫지 않는다
// 화면 확인용: 확인 창을 띄우지 않고 결과 화면을 PNG로 저장한 뒤 종료한다. 사용 중인 화면을 방해하지 않는다.
const SNAPSHOT = process.env.TODOBAN_SNAPSHOT;

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
let data: AppData;
let hotkeyError: string | null = null;

function updateTray(): void {
  const { open } = todayView(data.todos, localDate());
  tray?.setTitle(open.length ? ` ${open.length}` : "", { fontType: "monospacedDigit" });
}

function broadcast(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("data:changed", data);
  updateTray();
}

function act(action: TodoAction): AppData {
  data = applyAction(data, action);
  saveData(data);
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
    setTimeout(async () => {
      const img = await reviewWindow!.webContents.capturePage();
      writeFileSync(SNAPSHOT, img.toPNG());
      quitting = true;
      app.quit();
    }, 800);
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
  ipcMain.handle("quick:submit", (_e, text: string) => {
    const kind = classifyQuickInput(text);
    if (kind === "empty") return { ok: false };
    quickWindow?.hide();
    if (kind === "short") act({ type: "add", title: text.trim(), rawText: text });
    else startReview(text);
    return { ok: true, kind };
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

  if (SHOW_ON_START === "list" || SHOW_ON_START === "1") listWindow.once("ready-to-show", toggleListWindow);
  if (SHOW_ON_START === "quick") quickWindow.once("ready-to-show", showQuickWindow);

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
