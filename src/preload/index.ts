import { contextBridge, ipcRenderer } from "electron";
import type { AppData, TodoAction } from "@shared/types";
import type { ReviewDraft, ReviewState } from "@shared/review";

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
  getReview: (): Promise<ReviewState | null> => ipcRenderer.invoke("review:get"),
  onReview: (fn: (s: ReviewState) => void) => {
    const listener = (_e: unknown, s: ReviewState) => fn(s);
    ipcRenderer.on("review:state", listener);
    return () => {
      ipcRenderer.removeListener("review:state", listener);
    };
  },
  retryReview: () => ipcRenderer.send("review:retry"),
  cancelReview: () => ipcRenderer.send("review:cancel"),
  commitReview: (drafts: ReviewDraft[]) => ipcRenderer.send("review:commit", drafts),
  insertRawReview: () => ipcRenderer.send("review:insertRaw"),
  openTerminal: () => ipcRenderer.send("review:openTerminal"),
  resizeReview: (height: number) => ipcRenderer.send("review:resize", height),
};

export type TodoBanApi = typeof api;
contextBridge.exposeInMainWorld("todoban", api);
