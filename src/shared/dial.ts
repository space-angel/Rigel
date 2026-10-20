import type { TodoItem } from "./types.ts";
import { localDate, overdue, todayView } from "./todos.ts";

// 메뉴바 목록 머리의 부채꼴 다이얼(A1, A3). 고른 묶음의 할 일과, 그 묶음이 어떻게 이루어졌는지 비율로 보여 준다.
export const DIAL_VIEWS = ["done", "overdue", "today", "tomorrow", "later"] as const;
export type DialView = (typeof DIAL_VIEWS)[number];

export const DIAL_LABEL: Record<DialView, string> = {
  done: "Done",
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  later: "Later",
};

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

export interface DialBuckets {
  done: TodoItem[]; // 오늘 끝낸 할 일
  overdue: TodoItem[]; // 할 날짜가 지났는데 안 끝난 할 일
  today: TodoItem[]; // 오늘 목록 (지난 날짜 포함, 가져올지 묻는 중인 것은 뺌)
  tomorrow: TodoItem[];
  later: TodoItem[]; // 날짜 없음, 또는 모레 이후
}

export function dialBuckets(todos: TodoItem[], today: string, hidden: TodoItem[] = []): DialBuckets {
  const { open, done, later } = todayView(todos, today, hidden);
  const tomorrow = addDays(today, 1);
  return {
    done,
    overdue: overdue(todos, today),
    today: open,
    tomorrow: later.filter((t) => t.plannedDate === tomorrow),
    later: later.filter((t) => t.plannedDate !== tomorrow),
  };
}

export interface RatioPart {
  key: "done" | "ready" | "step" | "planned";
  count: number;
  pct: number;
}

// 비율 막대. 오늘은 끝냄 / 바로 시작 / 첫 행동 필요, 다른 묶음은 정리됨 / 첫 행동 필요.
// 퍼센트는 합이 100이 되도록 가장 큰 칸에서 반올림 오차를 맞춘다. 빈 칸은 뺀다.
export function dialRatio(view: DialView, b: DialBuckets): RatioPart[] {
  const parts: Omit<RatioPart, "pct">[] =
    view === "today"
      ? [
          { key: "done", count: b.done.length },
          { key: "ready", count: b.today.filter((t) => t.isClear).length },
          { key: "step", count: b.today.filter((t) => !t.isClear).length },
        ]
      : view === "done"
        ? [{ key: "done", count: b.done.length }]
        : [
            { key: "planned", count: b[view].filter((t) => t.isClear).length },
            { key: "step", count: b[view].filter((t) => !t.isClear).length },
          ];
  const shown = parts.filter((p) => p.count > 0);
  const total = shown.reduce((a, p) => a + p.count, 0);
  if (!total) return [];
  const withPct = shown.map((p) => ({ ...p, pct: Math.round((p.count / total) * 100) }));
  const diff = 100 - withPct.reduce((a, p) => a + p.pct, 0);
  if (diff) withPct.reduce((max, p) => (p.count > max.count ? p : max)).pct += diff;
  return withPct;
}
