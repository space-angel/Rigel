import { z } from "zod";

// 할 날짜와 날짜 비교는 모두 로컬 날짜 문자열(YYYY-MM-DD)로 한다.
export const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TodoItem = z.object({
  id: z.string(),
  title: z.string(),
  plannedDate: DateString.nullable(),
  order: z.number(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  rawText: z.string(),
  isClear: z.boolean(),
  shortcutId: z.string().nullable(),
});
export type TodoItem = z.infer<typeof TodoItem>;

export const Shortcut = z.object({
  id: z.string(),
  name: z.string(),
  keywords: z.array(z.string()),
  url: z.string(),
  appBundleId: z.string().nullable(),
});
export type Shortcut = z.infer<typeof Shortcut>;

export const Settings = z.object({
  hotkey: z.string(),
  claudePath: z.string().nullable(),
  model: z.string().nullable(),
  themeId: z.string(),
  openAtLogin: z.boolean(),
  lastCarryOverCheck: DateString.nullable(),
});
export type Settings = z.infer<typeof Settings>;

export const AppData = z.object({
  version: z.literal(1),
  todos: z.array(TodoItem),
  shortcuts: z.array(Shortcut),
  settings: Settings,
});
export type AppData = z.infer<typeof AppData>;

export const DEFAULT_SETTINGS: Settings = {
  hotkey: "Alt+Space",
  claudePath: null,
  model: "sonnet",
  themeId: "default",
  openAtLogin: false,
  lastCarryOverCheck: null,
};

export function emptyData(): AppData {
  return { version: 1, todos: [], shortcuts: [], settings: { ...DEFAULT_SETTINGS } };
}

// 렌더러가 메인 프로세스에 보내는 변경 요청. 메인이 적용하고 새 상태를 돌려준다.
export type TodoAction =
  | { type: "add"; title: string }
  | { type: "toggle"; id: string }
  | { type: "remove"; id: string }
  | { type: "rename"; id: string; title: string }
  | { type: "moveToToday"; id: string }
  | { type: "reorder"; id: string; beforeId: string | null; afterId: string | null };
