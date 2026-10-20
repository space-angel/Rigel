import { app, BrowserWindow, ipcMain, nativeImage, screen, Tray } from "electron";
import { join } from "node:path";
import type { AppData, TodoAction } from "@shared/types";
import { applyAction, localDate, todayView } from "@shared/todos";
import { loadData, saveData } from "./store";

app.setName("todoBAN");
// 개발 중 확인용: 실제 데이터 대신 다른 폴더를 쓰고, 실행하자마자 목록을 띄운다.
if (process.env.TODOBAN_USER_DATA) app.setPath("userData", process.env.TODOBAN_USER_DATA);
const SHOW_ON_START = process.env.TODOBAN_SHOW_ON_START === "1";

// 메뉴바 목록 창. 투명한 창 안에 카드와 그림자를 CSS로 그리므로, 그림자 여백만큼 창이 카드보다 크다.
const LIST_WIDTH = 380;
const LIST_MAX_HEIGHT = 640;

let tray: Tray | null = null;
let listWindow: BrowserWindow | null = null;
let data: AppData;

function updateTray(): void {
  const { open } = todayView(data.todos, localDate());
  tray?.setTitle(open.length ? ` ${open.length}` : "", { fontType: "monospacedDigit" });
}

function broadcast(): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("data:changed", data);
  updateTray();
}

function createListWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: LIST_WIDTH,
    height: 480,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
    },
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on("blur", () => {
    if (!win.webContents.isDevToolsOpened()) win.hide();
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html`);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
  return win;
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
  positionListWindow();
  listWindow.show();
  listWindow.focus();
  listWindow.webContents.send("list:opened");
}

app.whenReady().then(() => {
  app.dock?.hide();
  data = loadData();

  ipcMain.handle("data:get", () => data);
  ipcMain.handle("todo:action", (_e, action: TodoAction) => {
    data = applyAction(data, action);
    saveData(data);
    broadcast();
    return data;
  });
  // 렌더러가 내용 높이를 알려 주면 창 높이를 맞춘다. 창 밖의 투명한 영역이 클릭을 가로채지 않게 하려는 것.
  ipcMain.on("list:resize", (_e, height: number) => {
    if (!listWindow) return;
    const h = Math.min(Math.max(Math.ceil(height), 120), LIST_MAX_HEIGHT);
    const b = listWindow.getBounds();
    if (b.height !== h) listWindow.setBounds({ ...b, height: h });
  });
  ipcMain.on("list:hide", () => listWindow?.hide());

  const icon = nativeImage.createFromPath(join(__dirname, "../../resources/trayTemplate.png"));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("todoBAN");
  tray.on("click", toggleListWindow);
  tray.on("right-click", toggleListWindow);

  listWindow = createListWindow();
  updateTray();
  if (SHOW_ON_START) listWindow.once("ready-to-show", toggleListWindow);
});

app.on("window-all-closed", () => {
  // 메뉴바 앱이라 창을 모두 닫아도 종료하지 않는다.
});
