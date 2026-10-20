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

// 첫 행동을 빚을 때 쓸 도구. LOCAL은 앱이 맥 안에서 직접 읽는다. MCP 도구는 7-c에서 붙인다.
export const ToolSettings = z.object({
  local: z.object({ figma: z.boolean(), calendar: z.boolean(), files: z.boolean(), todoban: z.boolean() }),
  // MCP 도구(notion, linear, frame) 켜기. Claude가 읽어서 느리고 구독 사용량을 쓰므로 처음엔 모두 꺼 둔다.
  mcp: z.record(z.string(), z.boolean()).default({}),
  defaultMix: z.record(z.string(), z.number()),
});
export type ToolSettings = z.infer<typeof ToolSettings>;

// 캘린더와 파일은 맥 권한이나 자료 범위를 사용자가 보고 켜도록 처음엔 꺼 둔다.
export const DEFAULT_TOOLS: ToolSettings = {
  local: { figma: true, calendar: false, files: false, todoban: true },
  mcp: {},
  defaultMix: { figma: 30, calendar: 20, files: 15, todoban: 15, notion: 20, linear: 15, frame: 25, claude: 20 },
};

export const Settings = z.object({
  hotkey: z.string(),
  claudePath: z.string().nullable(),
  model: z.string().nullable(),
  themeId: z.string(),
  openAtLogin: z.boolean(),
  lastCarryOverCheck: DateString.nullable(),
  tools: ToolSettings.default(DEFAULT_TOOLS),
  // 시작하기 창(D4)을 마쳤는지. 이 필드가 없던 파일은 이미 쓰던 사람이라 true로 읽는다.
  welcomed: z.boolean().default(true),
});
export type Settings = z.infer<typeof Settings>;

// v1 파일에는 tools가 없다. 읽을 때 기본값을 채우고 version 2로 올린다.
export const AppData = z.object({
  version: z.union([z.literal(1), z.literal(2)]).transform((): 2 => 2),
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
  tools: DEFAULT_TOOLS,
  welcomed: false,
};

export function emptyData(): AppData {
  return { version: 2, todos: [], shortcuts: [], settings: { ...DEFAULT_SETTINGS } };
}

// 렌더러가 메인 프로세스에 보내는 변경 요청. 메인이 적용하고 새 상태를 돌려준다.
export type TodoAction =
  | { type: "add"; title: string; rawText?: string; shortcutId?: string | null }
  | {
      type: "addMany";
      rawText: string;
      items: { title: string; plannedDate: string | null; isClear: boolean; shortcutId: string | null }[];
    }
  | { type: "applyFirstStep"; id: string; title: string; shortcutId: string | null; toToday?: boolean }
  | { type: "toggle"; id: string }
  | { type: "remove"; id: string }
  | { type: "rename"; id: string; title: string }
  | { type: "moveToToday"; id: string }
  | { type: "reorder"; id: string; beforeId: string | null; afterId: string | null }
  | { type: "setShortcut"; id: string; shortcutId: string | null }
  | { type: "saveShortcut"; shortcut: ShortcutInput & { id?: string } }
  | { type: "removeShortcut"; id: string }
  | { type: "setSettings"; patch: Partial<Settings> }
  | { type: "carryOver"; to: "today" | "later" };

export interface ShortcutInput {
  name: string;
  keywords: string[];
  url: string;
  appBundleId: string | null;
}

export const FIGMA_BUNDLE_ID = "com.figma.Desktop";
