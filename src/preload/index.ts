import { contextBridge, ipcRenderer } from "electron";
import type { AppData, TodoAction } from "@shared/types";
import type { ReviewDraft, ReviewState } from "@shared/review";
import type { FirstStepState } from "@shared/firstStep";
import type { ShapeInput, ToolItem, ToolResult } from "@shared/shape";
import type { McpSource, McpStatus } from "@shared/mcp";

const api = {
  getData: (): Promise<AppData> => ipcRenderer.invoke("data:get"),
  act: (action: TodoAction): Promise<AppData> => ipcRenderer.invoke("todo:action", action),
  todoMenu: (id: string): Promise<string[]> => ipcRenderer.invoke("todo:menu", id),
  onTodoRequest: (fn: (kind: "edit" | "delete", id: string) => void) => {
    const edit = (_e: unknown, id: string) => fn("edit", id);
    const del = (_e: unknown, id: string) => fn("delete", id);
    ipcRenderer.on("todo:requestEdit", edit);
    ipcRenderer.on("todo:requestDelete", del);
    return () => {
      ipcRenderer.removeListener("todo:requestEdit", edit);
      ipcRenderer.removeListener("todo:requestDelete", del);
    };
  },
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
  getFirstSteps: (): Promise<FirstStepState[]> => ipcRenderer.invoke("firstStep:get"),
  onFirstSteps: (fn: (all: FirstStepState[]) => void) => {
    const listener = (_e: unknown, all: FirstStepState[]) => fn(all);
    ipcRenderer.on("firstStep:states", listener);
    return () => {
      ipcRenderer.removeListener("firstStep:states", listener);
    };
  },
  requestFirstStep: (id: string, opts: { answer?: string; again?: boolean; shape?: ShapeInput } = {}) => ipcRenderer.send("firstStep:request", id, opts),
  acceptFirstStep: (id: string, opts: { toToday?: boolean } = {}) => ipcRenderer.send("firstStep:accept", id, opts),
  collectTools: (todoId: string, words: string[]): Promise<ToolResult[]> => ipcRenderer.invoke("tools:collect", todoId, words),
  openToolItem: (open: ToolItem["open"]) => ipcRenderer.send("tools:open", open),
  collectMcp: (todoId: string, source: McpSource, words: string[]): Promise<ToolResult> => ipcRenderer.invoke("tools:collectMcp", todoId, source, words),
  cancelMcp: (todoId: string) => ipcRenderer.send("tools:cancelMcp", todoId),
  mcpStatus: (fresh?: boolean): Promise<Record<string, McpStatus>> => ipcRenderer.invoke("tools:mcpStatus", fresh),
  resizeWelcome: (height: number) => ipcRenderer.send("welcome:resize", height),
  finishWelcome: (openList: boolean) => ipcRenderer.send("welcome:finish", openList),
  installGuide: () => ipcRenderer.send("welcome:installGuide"),
  chooseClaude: (): Promise<string | null> => ipcRenderer.invoke("welcome:chooseClaude"),
  openMcpGuide: (kind: "terminal" | "connectors") => ipcRenderer.send("tools:openMcpGuide", kind),
  rulesStatus: (): Promise<{ customized: boolean; missing: string[] }> => ipcRenderer.invoke("settings:rulesStatus"),
  resetRules: (): Promise<{ customized: boolean; missing: string[] }> => ipcRenderer.invoke("settings:resetRules"),
  verifyMcp: (source: McpSource): Promise<{ ok: boolean; status: string; ms: number; workspace: string | null; account: string | null }> => ipcRenderer.invoke("tools:verifyMcp", source),
  onSettingsFocus: (fn: () => void) => {
    const listener = () => fn();
    ipcRenderer.on("settings:focus", listener);
    return () => {
      ipcRenderer.removeListener("settings:focus", listener);
    };
  },
  onShapeOpen: (fn: (todoId: string, auto: boolean) => void) => {
    const listener = (_e: unknown, id: string, auto: boolean) => fn(id, auto);
    ipcRenderer.on("shape:open", listener);
    return () => {
      ipcRenderer.removeListener("shape:open", listener);
    };
  },
  dismissFirstStep: (id: string) => ipcRenderer.send("firstStep:dismiss", id),
  openSettings: (tab?: "general" | "tools" | "shortcuts") => ipcRenderer.send("settings:open", tab),
  onSettingsTab: (fn: (tab: "general" | "tools" | "shortcuts") => void) => {
    const listener = (_e: unknown, tab: "general" | "shortcuts") => fn(tab);
    ipcRenderer.on("settings:tab", listener);
    return () => {
      ipcRenderer.removeListener("settings:tab", listener);
    };
  },
  resizeSettings: (height: number) => ipcRenderer.send("settings:resize", height),
  hotkeyStatus: (): Promise<string | null> => ipcRenderer.invoke("settings:hotkeyStatus"),
  claudeInfo: (): Promise<{ path: string | null; searched: string[]; version: string | null }> => ipcRenderer.invoke("settings:claudeInfo"),
  openRules: () => ipcRenderer.send("settings:openRules"),
  pauseHotkey: (paused: boolean) => ipcRenderer.send("settings:pauseHotkey", paused),
  openShortcut: (id: string): Promise<"app" | "browser" | null> => ipcRenderer.invoke("shortcut:open", id),
};

export type TodoBanApi = typeof api;
contextBridge.exposeInMainWorld("todoban", api);
