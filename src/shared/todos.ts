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

export interface TodayView {
  open: TodoItem[]; // 오늘, 끝나지 않음. 맨 앞이 지금 할 일
  done: TodoItem[]; // 오늘 끝낸 할 일
  later: TodoItem[]; // 할 날짜가 없거나 미래, 끝나지 않음
  unclearCount: number;
}

export function todayView(todos: TodoItem[], today: string): TodayView {
  const open = todos.filter((t) => !t.completedAt && isToday(t, today)).sort(byOrder);
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
        shortcutId: null,
      });
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
  }
  return { ...data, todos };
}
