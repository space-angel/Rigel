import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import { join } from "node:path";
import type { AppData, TodoAction } from "@shared/types";
import { applyAction, localDate, todayView } from "@shared/todos";
import { classifyQuickInput, firstLine } from "@shared/quickInput";
import { loadData, saveData } from "./store";

app.setName("todoBAN");
// 개발 중 확인용: 실제 데이터 대신 다른 폴더를 쓰고, 실행하자마자 목록이나 빠른 입력창을 띄운다.
if (process.env.TODOBAN_USER_DATA) app.setPath("userData", process.env.TODOBAN_USER_DATA);
const SHOW_ON_START = process.env.TODOBAN_SHOW_ON_START; // "list" | "quick"
const KEEP_OPEN = process.env.TODOBAN_KEEP_OPEN === "1"; // 화면 확인용: 포커스를 잃어도 닫지 않는다

// 투명한 창 안에 카드와 그림자를 CSS로 그리므로, 그림자 여백만큼 창이 카드보다 크다.
const LIST_WIDTH = 380;
const LIST_MAX_HEIGHT = 640;
const QUICK_WIDTH = 680;
const QUICK_MAX_HEIGHT = 260;

let tray: Tray | null = null;
let listWindow: BrowserWindow | null = null;
let quickWindow: BrowserWindow | null = null;
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
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html#${view}`);
  else win.loadFile(join(__dirname, "../renderer/index.html"), { hash: view });
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

  // 한 줄 30자 이하는 그대로 넣는다. 긴 입력은 3단계에서 확인 창으로 보낸다.
  // 그 전까지는 적은 내용이 사라지지 않게, 첫 줄을 제목으로 한 정리 안 된 할 일 하나로 넣는다.
  ipcMain.handle("quick:submit", (_e, text: string) => {
    const kind = classifyQuickInput(text);
    if (kind === "empty") return { ok: false };
    act({ type: "add", title: kind === "short" ? text.trim() : firstLine(text), rawText: text });
    quickWindow?.hide();
    return { ok: true, kind };
  });

  const icon = nativeImage.createFromPath(join(__dirname, "../../resources/trayTemplate.png"));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("todoBAN");
  tray.on("click", toggleListWindow);
  tray.on("right-click", () => tray?.popUpContextMenu(trayMenu()));

  listWindow = createPopupWindow("list", LIST_WIDTH, 480);
  quickWindow = createPopupWindow("quick", QUICK_WIDTH, 160);
  registerHotkey();
  updateTray();

  if (SHOW_ON_START === "list" || SHOW_ON_START === "1") listWindow.once("ready-to-show", toggleListWindow);
  if (SHOW_ON_START === "quick") quickWindow.once("ready-to-show", showQuickWindow);
});

app.on("will-quit", () => globalShortcut.unregisterAll());

app.on("window-all-closed", () => {
  // 메뉴바 앱이라 창을 모두 닫아도 종료하지 않는다.
});
