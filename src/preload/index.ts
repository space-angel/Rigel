import { contextBridge, ipcRenderer } from "electron";
import type { AppData, TodoAction } from "@shared/types";

const api = {
  getData: (): Promise<AppData> => ipcRenderer.invoke("data:get"),
  act: (action: TodoAction): Promise<AppData> => ipcRenderer.invoke("todo:action", action),
  onData: (fn: (data: AppData) => void) => {
    const listener = (_e: unknown, d: AppData) => fn(d);
    ipcRenderer.on("data:changed", listener);
    return () => {
      ipcRenderer.removeListener("data:changed", listener);
    };
  },
  onListOpened: (fn: () => void) => {
    const listener = () => fn();
    ipcRenderer.on("list:opened", listener);
    return () => {
      ipcRenderer.removeListener("list:opened", listener);
    };
  },
  resizeList: (height: number) => ipcRenderer.send("list:resize", height),
  hideList: () => ipcRenderer.send("list:hide"),
  onQuickOpened: (fn: () => void) => {
    const listener = () => fn();
    ipcRenderer.on("quick:opened", listener);
    return () => {
      ipcRenderer.removeListener("quick:opened", listener);
    };
  },
  resizeQuick: (height: number) => ipcRenderer.send("quick:resize", height),
  hideQuick: () => ipcRenderer.send("quick:hide"),
  submitQuick: (text: string): Promise<{ ok: boolean; kind?: "short" | "long" }> => ipcRenderer.invoke("quick:submit", text),
};

export type TodoBanApi = typeof api;
contextBridge.exposeInMainWorld("todoban", api);
