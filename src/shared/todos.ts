import type { AppData, TodoAction, TodoItem } from "./types.ts";

export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const byOrder = (a: TodoItem, b: TodoItem) => a.order - b.order;

export function isToday(t: TodoItem, today: string): boolean {
  return t.plannedDate !== null && t.plannedDate <= today;
}

// 할 날짜가 오늘보다 앞인데 끝나지 않은 할 일. 그날 처음 목록을 열 때 오늘로 가져올지 묻는다.
export function overdue(todos: TodoItem[], today: string): TodoItem[] {
  return todos.filter((t) => !t.completedAt && t.plannedDate !== null && t.plannedDate < today).sort(byOrder);
}

// 오늘 아직 묻지 않았고 가져올 할 일이 있으면 그 목록을, 아니면 빈 배열을 돌려준다.
export function pendingCarryOver(data: AppData, today: string): TodoItem[] {
  return data.settings.lastCarryOverCheck === today ? [] : overdue(data.todos, today);
}

export interface TodayView {
  open: TodoItem[]; // 오늘, 끝나지 않음. 맨 앞이 지금 할 일
  done: TodoItem[]; // 오늘 끝낸 할 일
  later: TodoItem[]; // 할 날짜가 없거나 미래, 끝나지 않음
  unclearCount: number;
}

// hidden: 오늘 목록에서 잠시 빼 둘 할 일(가져올지 묻는 중인 어제 할 일)
export function todayView(todos: TodoItem[], today: string, hidden: TodoItem[] = []): TodayView {
  const hide = new Set(hidden.map((t) => t.id));
  const open = todos.filter((t) => !t.completedAt && isToday(t, today) && !hide.has(t.id)).sort(byOrder);
  const done = todos
    .filter((t) => t.completedAt && localDate(new Date(t.completedAt)) === today)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? -1 : 1));
  const later = todos.filter((t) => !t.completedAt && !isToday(t, today)).sort(byOrder);
  return { open, done, later, unclearCount: open.filter((t) => !t.isClear).length };
}

// 두 할 일 사이에 끼울 때 앞뒤 order의 중간값을 쓴다. 다른 할 일의 order는 바꾸지 않는다.
export function orderBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function applyAction(data: AppData, action: TodoAction, now: Date = new Date()): AppData {
  const today = localDate(now);
  const todos = data.todos.map((t) => ({ ...t }));
  const find = (id: string) => todos.find((t) => t.id === id);

  switch (action.type) {
    case "add": {
      const title = action.title.trim();
      if (!title) return data;
      // 새 할 일은 오늘 목록 맨 아래에 들어간다.
      const last = todayView(todos, today).open.at(-1);
      todos.push({
        id: newId(),
        title,
        plannedDate: today,
        order: orderBetween(last?.order ?? null, null),
        completedAt: null,
        createdAt: now.toISOString(),
        rawText: action.rawText ?? action.title,
        // AI를 거치지 않고 바로 넣은 할 일은 정리 안 된 할 일이다.
        isClear: false,
        shortcutId: action.shortcutId ?? null,
      });
      break;
    }
    case "addMany": {
      // 확인 창에서 넣은 할 일. 오늘과 나중 각각의 맨 아래에 순서대로 붙인다.
      let lastToday = todayView(todos, today).open.at(-1)?.order ?? null;
      let lastLater = todayView(todos, today).later.at(-1)?.order ?? null;
      for (const item of action.items) {
        const title = item.title.trim();
        if (!title) continue;
        const forToday = item.plannedDate !== null && item.plannedDate <= today;
        const order = orderBetween(forToday ? lastToday : lastLater, null);
        if (forToday) lastToday = order;
        else lastLater = order;
        todos.push({
          id: newId(),
          title,
          plannedDate: item.plannedDate,
          order,
          completedAt: null,
          createdAt: now.toISOString(),
          rawText: action.rawText,
          isClear: item.isClear,
          shortcutId: item.shortcutId,
        });
      }
      break;
    }
    case "applyFirstStep": {
      // 정리 안 된 할 일을 첫 행동으로 바꾼다. 바로가기는 새로 정해졌을 때만 바꾼다.
      const t = find(action.id);
      const title = action.title.trim();
      if (!t || !title) return data;
      t.title = title;
      t.isClear = true;
      if (action.shortcutId) t.shortcutId = action.shortcutId;
      break;
    }
    case "toggle": {
      const t = find(action.id);
      if (!t) return data;
      t.completedAt = t.completedAt ? null : now.toISOString();
      break;
    }
    case "remove":
      return { ...data, todos: todos.filter((t) => t.id !== action.id) };
    case "rename": {
      const t = find(action.id);
      const title = action.title.trim();
      if (!t || !title) return data;
      t.title = title;
      break;
    }
    case "moveToToday": {
      const t = find(action.id);
      if (!t) return data;
      const last = todayView(todos, today).open.at(-1);
      t.plannedDate = today;
      t.order = orderBetween(last?.order ?? null, null);
      break;
    }
    case "reorder": {
      const t = find(action.id);
      if (!t) return data;
      const before = action.beforeId ? find(action.beforeId)?.order ?? null : null;
      const after = action.afterId ? find(action.afterId)?.order ?? null : null;
      t.order = orderBetween(before, after);
      break;
    }
    case "setShortcut": {
      const t = find(action.id);
      if (!t) return data;
      t.shortcutId = action.shortcutId;
      break;
    }
    case "saveShortcut": {
      const input = action.shortcut;
      const name = input.name.trim();
      const url = input.url.trim();
      if (!name || !url) return data;
      const keywords = [...new Set(input.keywords.map((k) => k.trim()).filter(Boolean))];
      const shortcut = { id: input.id ?? newId(), name, keywords: keywords.length ? keywords : [name], url, appBundleId: input.appBundleId };
      const exists = data.shortcuts.some((s) => s.id === shortcut.id);
      const shortcuts = exists ? data.shortcuts.map((s) => (s.id === shortcut.id ? shortcut : s)) : [...data.shortcuts, shortcut];
      return { ...data, todos, shortcuts };
    }
    case "removeShortcut": {
      // 지운 바로가기에 연결된 할 일은 연결만 끊는다.
      for (const t of todos) if (t.shortcutId === action.id) t.shortcutId = null;
      return { ...data, todos, shortcuts: data.shortcuts.filter((s) => s.id !== action.id) };
    }
    case "carryOver": {
      for (const t of overdue(todos, today)) t.plannedDate = action.to === "today" ? today : null;
      return { ...data, todos, settings: { ...data.settings, lastCarryOverCheck: today } };
    }
    case "setSettings":
      return { ...data, todos, settings: { ...data.settings, ...action.patch } };
  }
  return { ...data, todos };
}

// 피그마 링크에 node-id가 있으면 그 프레임까지 열린다.
export function figmaLinkInfo(url: string): { isFigma: boolean; hasNode: boolean } {
  try {
    const u = new URL(url.trim());
    const isFigma = /(^|\.)figma\.com$/.test(u.hostname);
    return { isFigma, hasNode: isFigma && u.searchParams.has("node-id") };
  } catch {
    return { isFigma: false, hasNode: false };
  }
}
