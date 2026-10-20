import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AppData, Shortcut, TodoItem } from "@shared/types";
import { localDate, pendingCarryOver, todayView } from "@shared/todos";
import { displayAccelerator } from "@shared/hotkey";
import type { FirstStepState } from "@shared/firstStep";
import { AiSparkle, ArrowRightIcon, CalendarIcon, CheckIcon, ChevronRightIcon, FigmaMark, MoreIcon, PinIcon, PlayIcon, PlusIcon, SettingsIcon } from "./components/icons";
import { FirstStepCard } from "./FirstStepCard";
import { ShapePanel } from "./Shape";
import { Attachments } from "./components/Attachments";
import { DuePicker } from "./components/DuePicker";
import { Presence } from "./components/Presence";
import { useFlip } from "./components/useFlip";
import { dueBadge, dueLabel } from "@shared/due";
import { currentLang, loc, t } from "./i18n";

// 마감 배지. 줄에서는 짧게(D-3), 지금 할 일 카드에서는 말로(3 days left).
function Due({ item, long }: { item: TodoItem; long?: boolean }) {
  if (!item.dueDate || item.completedAt) return null;
  const today = localDate();
  const b = long ? dueLabel(item.dueDate, today, currentLang()) : dueBadge(item.dueDate, today, currentLang());
  return (
    <span className={`due-badge due-badge--${b.tone}`} title={t("Due {date}", { date: item.dueDate })}>
      {b.text}
    </span>
  );
}
import { FanDial } from "./components/FanDial";
import { RatioBar } from "./components/RatioBar";
import { DIAL_LABEL, DIAL_VIEWS, dialBuckets, dialRatio, type DialView } from "@shared/dial";

const api = window.todoban;

function dateLabel(d = new Date()): string {
  if (currentLang() === "ko") return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase().replace(",", " ·");
}

function Checkbox({ checked, onToggle, variant = "default" }: { checked: boolean; onToggle: () => void; variant?: "default" | "now" }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`checkbox checkbox--${variant}${checked ? " is-checked" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {/* 체크: 파란 빛이 동그라미를 한 바퀴 채우고(sweep) 안이 차오른 뒤 체크가 그려진다. 작은 SVG 선만 다시 그린다. */}
      <span className="cb__fill" />
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle className="cb__ring" cx="10" cy="10" r="8.75" />
        <circle className="cb__sweep" cx="10" cy="10" r="8.75" pathLength={1} />
        <path className="cb__mark" d="M6.2 10.4l2.6 2.6 5.2-5.6" pathLength={1} />
      </svg>
    </button>
  );
}

// 바로가기가 연결된 할 일에만 보이는 시작 버튼. 피그마 앱에서 프레임을 연다.
function StartButton({ shortcut, variant = "row" }: { shortcut: Shortcut; variant?: "row" | "now" }) {
  return (
    <button
      type="button"
      className={`start start--${variant}`}
      title={shortcut.url}
      aria-label={t("Open {name}", { name: shortcut.name })}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        api.openShortcut(shortcut.id);
      }}
    >
      {variant === "now" ? (
        <ArrowRightIcon size={16} />
      ) : (
        <>
          <PlayIcon size={9} />
          {shortcut.name}
        </>
      )}
    </button>
  );
}

// 할 일 줄의 고치기·메뉴 동작. 목록이 들고 있고 줄은 받아서 쓴다.
interface EditProps {
  editing: boolean;
  onEdit: () => void;
  onSave: (title: string) => void;
  onCancel: () => void;
  onMenu: () => void;
}

// 제목을 그 자리에서 고친다. Enter 저장, Esc 취소, 다른 곳을 누르면 저장.
function Title({ item, className, editing, onEdit, onSave, onCancel }: { item: TodoItem; className: string } & Omit<EditProps, "onMenu">) {
  const [value, setValue] = useState(item.title);
  useEffect(() => setValue(item.title), [editing, item.title]);
  if (!editing)
    return (
      <span className={className} onDoubleClick={(e) => (e.stopPropagation(), onEdit())}>
        {item.title}
      </span>
    );
  return (
    <input
      className={`${className} title-input`}
      aria-label={t("Task title")}
      autoFocus
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") onSave(value);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onSave(value)}
    />
  );
}

function MoreButton({ onMenu }: { onMenu: () => void }) {
  return (
    <button
      type="button"
      className="more"
      aria-label={t("More actions")}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onMenu();
      }}
    >
      <MoreIcon size={14} />
    </button>
  );
}

// 정리 안 된 할 일은 한 번 누르면 빚기를 연다. 더블클릭(제목 고치기)과 겹치지 않게 잠깐 기다린다.
function useSingleClick(fn: (() => void) | undefined) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  if (!fn) return {};
  return {
    onClick: (e: React.MouseEvent) => {
      if (e.detail > 1) return;
      timer.current = setTimeout(fn, 220);
    },
    onDoubleClickCapture: () => timer.current && clearTimeout(timer.current),
  };
}

function NowCard({
  item,
  shortcut,
  selected,
  onToggle,
  onFirstStep,
  onShape,
  edit,
  isNew,
  completing,
}: {
  item: TodoItem;
  shortcut?: Shortcut;
  selected: boolean;
  onToggle: () => void;
  onFirstStep: () => void;
  onShape: () => void;
  edit: EditProps;
  isNew?: boolean;
  completing?: boolean;
}) {
  const click = useSingleClick(item.isClear || edit.editing ? undefined : onShape);
  return (
    <div
      data-flip-id={item.id}
      className={`now-card${selected ? " is-selected" : ""}${isNew ? " is-new" : ""}${completing ? " is-completing" : ""}`}
      {...click}
      onContextMenu={(e) => {
        e.preventDefault();
        edit.onMenu();
      }}
    >
      <div className="now-card__top">
        <span className="now-card__eyebrow">
          <span className="eyebrow">{t("Now")}</span>
          <Due item={item} long />
        </span>
        <span className="now-card__tools">
          <MoreButton onMenu={edit.onMenu} />
          <Checkbox checked={Boolean(completing)} onToggle={onToggle} variant="now" />
        </span>
      </div>
      <Title item={item} className="now-card__title" {...edit} />
      {!edit.editing && <Attachments notes={item.context.filter((n) => !(shortcut && n.source === "figma"))} variant="chips" />}
      {item.isClear ? (
        <div className="now-card__bottom">
          {shortcut ? (
            <span className="source-chip">
              <FigmaMark size={11} /> {shortcut.name}
            </span>
          ) : (
            <span className="now-card__sub">{t("Ready to start")}</span>
          )}
          {shortcut && <StartButton shortcut={shortcut} variant="now" />}
        </div>
      ) : (
        <button
          type="button"
          className="pill-question"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onFirstStep();
          }}
        >
          <AiSparkle size={12} /> {t("Let Claude find a first step")}
        </button>
      )}
    </div>
  );
}

function Row({
  item,
  shortcut,
  selected,
  done,
  trailing,
  onToggle,
  onFirstStep,
  edit,
  isNew,
  completing,
}: {
  item: TodoItem;
  shortcut?: Shortcut;
  selected?: boolean;
  done?: boolean;
  trailing?: React.ReactNode;
  onToggle: () => void;
  onFirstStep?: () => void;
  edit: EditProps;
  isNew?: boolean;
  completing?: boolean;
}) {
  const unclear = !item.isClear && !done;
  const click = useSingleClick(unclear && !edit.editing ? onFirstStep : undefined);
  return (
    <div
      data-flip-id={item.id}
      className={`row${selected ? " is-selected" : ""}${done ? " is-done" : ""}${unclear ? " is-unclear" : ""}${edit.editing ? " is-editing" : ""}${isNew ? " is-new" : ""}${completing ? " is-completing" : ""}`}
      {...click}
      onContextMenu={(e) => {
        e.preventDefault();
        edit.onMenu();
      }}
    >
      <Checkbox checked={Boolean(done) || Boolean(completing)} onToggle={onToggle} />
      {unclear && <span className="row__dot" aria-label={t("Unclear")} />}
      <Title item={item} className="row__title" {...edit} />
      {!edit.editing && (
        <>
          <Due item={item} />
          {unclear && onFirstStep && (
            <span className="row__hint">
              <AiSparkle size={12} /> {t("Shape")}
            </span>
          )}
          <Attachments notes={item.context.filter((n) => !(shortcut && n.source === "figma"))} variant="icons" />
          {shortcut && !done && <StartButton shortcut={shortcut} />}
          {trailing}
          <MoreButton onMenu={edit.onMenu} />
        </>
      )}
    </div>
  );
}

function shortDate(date: string): string {
  // 한국어는 “10월 22일”이 길어 제목을 가리므로 10/22로 쓴다.
  if (currentLang() === "ko") return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return new Date(`${date}T00:00:00`).toLocaleDateString(loc(), { month: "short", day: "numeric" }).toUpperCase();
}

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`sortable${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}

export function TodayList() {
  const [data, setData] = useState<AppData | null>(null);
  const [draft, setDraft] = useState("");
  // 머리 다이얼로 고른 묶음. 목록을 열 때마다 Today로 돌아온다.
  // dial: 목록에 보이는 묶음. aim: 다이얼이 가리키는 칸(손을 바로 따라감).
  // 한 칸씩 연달아 넘기면 aim만 따라가고, 멈춘 칸에서 한 번만 dial을 바꾼다(목록 교체·카드 높이가 한 번만 움직이게).
  const [dial, setDialState] = useState<DialView>("today");
  const [aim, setAim] = useState<DialView>("today");
  const dialRef = useRef<DialView>("today");
  const aimRef = useRef<DialView>("today");
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 묶음을 바로 바꾼다(열 때, 새 할 일 보여 줄 때). 다이얼도 같이.
  const setDial = (v: DialView) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    dialRef.current = aimRef.current = v;
    setDialState(v);
    setAim(v);
  };
  const [dialDir, setDialDir] = useState<"next" | "prev" | null>(null);
  const [selected, setSelected] = useState(0);
  const [firstSteps, setFirstSteps] = useState<FirstStepState[]>([]);
  // 빚기(C1, C2)를 열어 둔 할 일. auto면 바로 Shape it을 누른다(화면 확인용).
  const [shaping, setShaping] = useState<{ id: string; auto: boolean } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 끌어서 순서를 바꾸는 중에는 dnd-kit이 움직이므로 FLIP을 쉰다.
  const dragging = useRef(false);
  useFlip(scrollRef, dragging);
  // 제자리에서 고치는 중인 할 일, 방금 지워서 되살릴 수 있는 할 일
  const [editingId, setEditingId] = useState<string | null>(null);
  const [undo, setUndo] = useState<TodoItem | null>(null);
  // 방금 넣은 할 일. 목록이 열릴 때 그 묶음으로 다이얼을 돌리고, 잠깐 빛나게 한다.
  const [highlight, setHighlight] = useState<string[]>([]);
  // 마감을 고르는 중인 할 일 (메뉴의 Pick a date…, ⌘D)
  const [duePickId, setDuePickId] = useState<string | null>(null);
  // 체크한 할 일: 체크가 채워지고 줄 안에서 빛이 번진 뒤 앞으로 밀려 나가는 동안(420ms) 자리에 두었다가 끝낸 할 일로 보낸다.
  const [completing, setCompleting] = useState<string[]>([]);
  // 화면 전환 방향(목록 → 빚기는 앞으로, 돌아오면 뒤로)과 창 열기 움직임
  const [viewDir, setViewDir] = useState<"forward" | "back" | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<AppData | null>(null);
  dataRef.current = data;

  useEffect(() => {
    api.getData().then(setData);
    api.getFirstSteps().then(setFirstSteps);
    const offData = api.onData(setData);
    const offFirst = api.onFirstSteps(setFirstSteps);
    const offOpen = api.onListOpened((opts) => {
      replayOpen();
      setSelected(0);
      setDialDir(null);
      setDial("today");
      setShaping(null);
      rootRef.current?.focus();
      if (opts?.highlight?.length) setHighlight(opts.highlight);
    });
    const offShape = api.onShapeOpen((id, auto) => {
      setViewDir("forward");
      setShaping({ id, auto });
    });
    // ⋯ 메뉴나 오른쪽 클릭 메뉴에서 고르면 메인이 알려 준다.
    const offRequest = api.onTodoRequest((kind, id) => {
      if (kind === "edit") setEditingId(id);
      else if (kind === "due") setDuePickId(id);
      else {
        const t = dataRef.current?.todos.find((x) => x.id === id);
        if (t) removeRef.current(t);
      }
    });
    return () => {
      offRequest();
      offData();
      offOpen();
      offFirst();
      offShape();
    };
  }, []);

  // 카드 높이에 맞춰 창 높이를 바꾼다. 창이 곧 카드다.
  const hasData = data !== null;
  // 카드 높이를 부드럽게: 안쪽(inner)의 원래 높이가 바뀌면 카드(shell) 높이를 이전 값에서 새 값으로 옮긴다.
  // ResizeObserver는 그리기 전에 불리므로 순간적으로 커지거나 줄어든 모습이 보이지 않는다.
  // 창은 커질 때 먼저 키우고, 줄어들 때는 움직임이 끝난 뒤 줄인다(투명한 여백이라 보이지 않는다).
  const innerRef = useRef<HTMLDivElement>(null);
  const heightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHeight = useRef(0);
  useLayoutEffect(() => {
    const inner = innerRef.current;
    const shell = shellRef.current;
    if (!inner || !shell) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const border = 2; // 위아래 테두리
    const ro = new ResizeObserver(() => {
      const to = Math.ceil(inner.getBoundingClientRect().height) + border;
      const from = lastHeight.current || to;
      lastHeight.current = to;
      if (heightTimer.current) clearTimeout(heightTimer.current);
      if (reduce || Math.abs(to - from) < 2 || !shell.isConnected) {
        shell.style.height = "";
        api.resizeList(to);
        return;
      }
      const current = shell.getBoundingClientRect().height || from;
      api.resizeList(Math.max(current, to));
      api.listAnimating(280);
      shell.style.transition = "none";
      shell.style.height = `${current}px`;
      void shell.offsetHeight;
      shell.style.transition = "";
      shell.style.height = `${to}px`;
      heightTimer.current = setTimeout(() => {
        shell.style.height = "";
        api.resizeList(to);
      }, 260);
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [hasData, Boolean(shaping)]);

  // 키보드로 고른 줄이 목록 영역 밖으로 나가면 그 줄이 보이도록 스크롤한다.
  useEffect(() => {
    const el = scrollRef.current?.querySelector(".is-selected");
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [selected, dial]);

  // 창을 열 때마다 내려오는 움직임을 다시 튼다(같은 요소에 클래스를 뺐다 넣는다).
  const replayOpen = () => {
    const el = shellRef.current;
    if (!el) return;
    el.classList.remove("is-opening");
    void el.offsetWidth;
    el.classList.add("is-opening");
    // 움직임이 끝나면 클래스를 뺀다(나중에 생기는 요소가 다시 움직이지 않게).
    setTimeout(() => el.classList.remove("is-opening"), 400);
  };
  const complete = (t: TodoItem) => {
    const toggle = () => api.act({ type: "toggle", id: t.id }).then(setData);
    if (t.completedAt || completing.includes(t.id)) return void toggle();
    setCompleting((c) => [...c, t.id]);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      toggle();
      setCompleting((c) => c.filter((x) => x !== t.id));
    }, reduce ? 0 : 420);
  };

  // 지우면 바로 지우고, 5초 동안 되살리기 안내를 보여 준다.
  const remove = (t: TodoItem) => {
    api.act({ type: "remove", id: t.id }).then(setData);
    api.dismissFirstStep(t.id);
    if (editingId === t.id) setEditingId(null);
    setUndo(t);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  };
  const removeRef = useRef(remove);
  removeRef.current = remove;
  const restore = () => {
    if (!undo) return;
    api.act({ type: "restore", item: undo }).then(setData);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };

  // 방금 넣은 할 일이 있는 묶음을 보여 주고 첫 줄을 고른다. 2.4초 뒤 표시를 지운다.
  useEffect(() => {
    if (!highlight.length || !data) return;
    const b = dialBuckets(data.todos, localDate(), pendingCarryOver(data, localDate()));
    const view = (["today", "tomorrow", "later", "overdue"] as const).find((v) => b[v].some((t) => highlight.includes(t.id)));
    if (view) {
      setDial(view);
      setSelected(Math.max(0, b[view].findIndex((t) => highlight.includes(t.id))));
    }
    const timer = setTimeout(() => setHighlight([]), 2400);
    return () => clearTimeout(timer);
  }, [highlight, data !== null]);

  const carry = useMemo(() => (data ? pendingCarryOver(data, localDate()) : []), [data]);
  const view = useMemo(() => (data ? todayView(data.todos, localDate(), carry) : null), [data, carry]);
  const buckets = useMemo(() => (data ? dialBuckets(data.todos, localDate(), carry) : null), [data, carry]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (!data || !view || !buckets) return null;
  const { open, done, later, unclearCount } = view;
  const [now, ...rest] = open;
  // 키보드로 고르는 줄: Today는 오늘 목록, 다른 묶음은 그 묶음의 할 일
  const rows = dial === "today" ? open : buckets[dial];
  const commitDial = (v: DialView) => {
    if (v === dialRef.current) return;
    // 다이얼이 도는 쪽에서 목록이 들어온다(오른쪽 묶음으로 가면 오른쪽에서).
    setDialDir(DIAL_VIEWS.indexOf(v) > DIAL_VIEWS.indexOf(dialRef.current) ? "next" : "prev");
    dialRef.current = v;
    setDialState(v);
    setSelected(0);
  };
  const STEP_SETTLE_MS = 120;
  const turnDial = (v: DialView, how: "step" | "jump" = "jump") => {
    aimRef.current = v;
    setAim(v);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    if (how === "jump") commitDial(v);
    else commitTimer.current = setTimeout(() => commitDial(v), STEP_SETTLE_MS);
  };

  const act = (a: Parameters<typeof api.act>[0]) => api.act(a).then(setData);
  const stepOf = (id: string) => firstSteps.find((f) => f.todoId === id);
  const shortcutOf = (t: TodoItem) => (t.shortcutId ? data.shortcuts.find((s) => s.id === t.shortcutId) : undefined);
  const askFirstStep = (t: TodoItem) => {
    if (!stepOf(t.id)) api.requestFirstStep(t.id);
  };
  const shape = (t: TodoItem) => {
    setViewDir("forward");
    setShaping({ id: t.id, auto: false });
  };
  const edit = (t: TodoItem): EditProps => ({
    editing: editingId === t.id,
    onEdit: () => setEditingId(t.id),
    onSave: (title) => {
      setEditingId(null);
      if (title.trim() && title.trim() !== t.title) act({ type: "rename", id: t.id, title });
      rootRef.current?.focus();
    },
    onCancel: () => {
      setEditingId(null);
      rootRef.current?.focus();
    },
    onMenu: () => api.todoMenu(t.id),
  });
  const stepCard = (t: TodoItem) => {
    const st = stepOf(t.id);
    if (shaping?.id === t.id) return null;
    return st && <FirstStepCard key={`${st.todoId}-${st.status}-${st.question ?? ""}`} state={st} originalTitle={t.title} />;
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    // 놓은 뒤 순서가 저장되며 한 번 더 그려진다. 그때까지 FLIP을 쉰다.
    setTimeout(() => (dragging.current = false), 300);
    if (!over || active.id === over.id) return;
    const ids = open.map((t) => t.id);
    const moved = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    const i = moved.indexOf(String(active.id));
    act({ type: "reorder", id: String(active.id), beforeId: moved[i - 1] ?? null, afterId: moved[i + 1] ?? null });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (shaping) {
      if (e.key === "Escape") {
        setViewDir("back");
        setShaping(null);
      }
      return;
    }
    const current = rows[selected];
    const di = DIAL_VIEWS.indexOf(aimRef.current);
    if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, rows.length - 1));
    else if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
    else if (e.key === "ArrowLeft" && di > 0) turnDial(DIAL_VIEWS[di - 1]!, "step");
    else if (e.key === "ArrowRight" && di < DIAL_VIEWS.length - 1) turnDial(DIAL_VIEWS[di + 1]!, "step");
    else if (e.key === " " && current) complete(current);
    else if (e.key === "Enter" && current && !current.isClear && !current.completedAt) (dial === "today" ? askFirstStep(current) : shape(current));
    else if (e.key === "Enter" && current && shortcutOf(current)) api.openShortcut(current.shortcutId!);
    else if (e.key === "," && e.metaKey) api.openSettings();
    else if (e.key === "Backspace" && e.metaKey && current) remove(current);
    // 한글 입력 중에도 되도록 글자 대신 키 자리(code)로 본다.
    else if (e.code === "KeyE" && e.metaKey && current) setEditingId(current.id);
    else if (e.code === "KeyD" && e.metaKey && current && !current.completedAt) setDuePickId(current.id);
    else if (e.code === "KeyZ" && e.metaKey && undo) restore();
    else if (e.key === "n" && e.metaKey) captureRef.current?.focus();
    else if (e.key === "Escape") api.hideList();
    else return;
    e.preventDefault();
  };

  // 아래 입력 바는 빠른 입력창과 같은 규칙을 쓴다: 짧으면 바로 넣고, 길면 확인 창에서 나눈다.
  const submitDraft = async () => {
    if (!draft.trim()) return;
    const res = await api.submitQuick(draft);
    if (res.ok) setDraft("");
  };

  const shapingTodo = shaping && data.todos.find((t) => t.id === shaping.id);
  if (shapingTodo)
    return (
      <div className="window" ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
        <div className={`shell${data.settings.listPin.pinned ? " is-pinned" : ""}${viewDir ? ` view--${viewDir}` : ""}`} ref={shellRef}>
          <div className="shell__inner" ref={innerRef}>
          <ShapePanel
            key={shapingTodo.id}
            todo={shapingTodo}
            data={data}
            state={stepOf(shapingTodo.id)}
            auto={shaping.auto}
            onClose={() => {
              setViewDir("back");
              setShaping(null);
              rootRef.current?.focus();
            }}
          />
          </div>
        </div>
      </div>
    );

  return (
    <div className="window" ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className={`shell${data.settings.listPin.pinned ? " is-pinned" : ""}${viewDir ? ` view--${viewDir}` : ""}`} ref={shellRef}>
        <div className="shell__inner" ref={innerRef}>
        <header className="header">
          <div className="header__title">
            <h1>{t("Today")}</h1>
            <div className="header__sub">
              <span>{dateLabel()}</span>
              {open.length > 0 && <span>· {t("{n} open", { n: open.length })}</span>}
              {unclearCount > 0 && <span className="chip">{t("{n} unclear", { n: unclearCount })}</span>}
            </div>
          </div>
          <button type="button" className="icon-button" aria-label={t("Add task")} onClick={() => captureRef.current?.focus()}>
            <PlusIcon size={14} />
          </button>
          <button
            type="button"
            className={`icon-button${data.settings.listPin.pinned ? " is-on" : ""}`}
            aria-label={data.settings.listPin.pinned ? t("Unpin list") : t("Pin list")}
            aria-pressed={data.settings.listPin.pinned}
            title={data.settings.listPin.pinned ? t("Unpin — closes when you click elsewhere") : t("Pin — stays open while you use other apps")}
            onClick={() => api.pinList(!data.settings.listPin.pinned)}
          >
            <PinIcon size={14} />
          </button>
          <button type="button" className="icon-button" aria-label={t("Settings")} onClick={() => api.openSettings()}>
            <SettingsIcon size={14} />
          </button>
        </header>

        <div className="overview">
          <FanDial
            variant="bare"
            label={t("Which tasks to show")}
            items={DIAL_VIEWS.map((v) => ({ key: v, label: t(DIAL_LABEL[v]), muted: v !== "today" && buckets[v].length === 0 }))}
            value={aim}
            onChange={turnDial}
          />
          <RatioBar view={dial} parts={dialRatio(dial, buckets)} />
        </div>

        <div className="scroll" ref={scrollRef}>
          {dial !== "today" ? (
            <section className={`section section--view${dialDir ? ` swap--${dialDir}` : ""}`} key={dial}>
              <h2 className="section__label">
                {t(DIAL_LABEL[dial])} · {buckets[dial].length}
              </h2>
              {buckets[dial].length === 0 && <p className="section__empty">{t("Nothing here.")}</p>}
              {buckets[dial].map((item, i) => (
                <Row
                  key={item.id}
                  item={item}
                  shortcut={shortcutOf(item)}
                  selected={selected === i}
                  done={dial === "done"}
                  onToggle={() => complete(item)}
                  completing={completing.includes(item.id)}
                  onFirstStep={() => shape(item)}
                  edit={edit(item)}
                  isNew={highlight.includes(item.id)}
                  trailing={
                    dial !== "done" && (
                      <>
                        {item.plannedDate && item.plannedDate !== item.dueDate && <span className="row__date">{shortDate(item.plannedDate)}</span>}
                        <button
                          type="button"
                          className="small-button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            act({ type: "moveToToday", id: item.id });
                          }}
                        >
                          → {t("Today")}
                        </button>
                      </>
                    )
                  }
                />
              ))}
              <button type="button" className="section__toggle" onClick={() => turnDial("today")}>
                {t("Back to Today")} <ChevronRightIcon size={12} />
              </button>
            </section>
          ) : (
            <div className={dialDir ? `swap--${dialDir}` : undefined} key="today">
          {carry.length > 0 && (
            <div className="carry motion-rise">
              <div className="carry__top">
                <span className="eyebrow">
                  <CalendarIcon size={12} /> {t("From yesterday")}
                </span>
                <span className="eyebrow eyebrow--count">{t("{n} left", { n: carry.length })}</span>
              </div>
              <p className="carry__title">{carry.length === 1 ? t("Bring this task into today?") : t("Bring these {n} tasks into today?", { n: carry.length })}</p>
              <p className="carry__desc">{carry.map((t) => t.title).join(" · ")}</p>
              <div className="carry__actions">
                <button type="button" className="button button--primary button--sm" onClick={() => act({ type: "carryOver", to: "today" })}>
                  {t("Bring to today")}
                </button>
                <button type="button" className="text-button" onClick={() => act({ type: "carryOver", to: "later" })}>
                  {t("Later")}
                </button>
              </div>
            </div>
          )}

          {open.length === 0 && carry.length === 0 && (
            <div className="empty motion-rise">
              <span className="empty__mark">
                <CheckIcon size={18} />
              </span>
              <p className="empty__title">{done.length ? t("All clear for today") : t("Nothing for today yet")}</p>
              <p className="empty__sub">{done.length ? t("{n} done. Capture the next thought below.", { n: done.length }) : t("Write what's on your mind below.")}</p>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => (dragging.current = true)} onDragEnd={onDragEnd} onDragCancel={() => (dragging.current = false)}>
            <SortableContext items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="list">
                {now && (
                  <SortableItem id={now.id}>
                    <NowCard item={now} shortcut={shortcutOf(now)} selected={selected === 0} onToggle={() => complete(now)} completing={completing.includes(now.id)} onFirstStep={() => askFirstStep(now)} onShape={() => shape(now)} edit={edit(now)} isNew={highlight.includes(now.id)} />
                  </SortableItem>
                )}
                {now && stepCard(now)}
                {rest.map((t, i) => (
                  <div key={t.id}>
                    <SortableItem id={t.id}>
                      <Row item={t} shortcut={shortcutOf(t)} selected={selected === i + 1} onToggle={() => complete(t)} completing={completing.includes(t.id)} onFirstStep={() => shape(t)} edit={edit(t)} isNew={highlight.includes(t.id)} />
                    </SortableItem>
                    {stepCard(t)}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {(done.length > 0 || later.length > 0) && (
            <nav className="quiet-links motion-fade">
              {(["done", "tomorrow", "later"] as const)
                .filter((v) => buckets[v].length > 0)
                .map((v) => (
                  <button type="button" key={v} className="section__toggle" onClick={() => turnDial(v)}>
                    {t(DIAL_LABEL[v])} <span className="section__count">{buckets[v].length}</span> <ChevronRightIcon size={12} />
                  </button>
                ))}
            </nav>
          )}
            </div>
          )}
        </div>

        <Presence value={duePickId ? data.todos.find((t) => t.id === duePickId) : null}>
          {(item, state) => (
            <div className="motion-sheet" data-motion={state}>
              <DuePicker
                item={item}
                onPick={(date) => {
                  act({ type: "setDue", id: item.id, dueDate: date });
                  setDuePickId(null);
                  rootRef.current?.focus();
                }}
                onClose={() => {
                  setDuePickId(null);
                  rootRef.current?.focus();
                }}
              />
            </div>
          )}
        </Presence>
        <Presence value={undo}>
          {(u, state) => (
            <div className="toast motion-sheet" data-motion={state} role="status">
              <span className="toast__text">{t("Deleted “{title}”", { title: u.title })}</span>
              <button type="button" className="toast__undo" onClick={restore}>
                {t("Undo")} <kbd>⌘Z</kbd>
              </button>
            </div>
          )}
        </Presence>
        <footer className="capture">
          <AiSparkle size={14} className="capture__icon" />
          <input
            ref={captureRef}
            value={draft}
            placeholder={t("Capture a thought…")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") submitDraft();
              if (e.key === "Escape") {
                setDraft("");
                rootRef.current?.focus();
              }
            }}
          />
          {!draft && <kbd>{displayAccelerator(data.settings.hotkey)}</kbd>}
          <button type="button" className="capture__send" aria-label={t("Add")} disabled={!draft.trim()} onClick={submitDraft}>
            <ArrowRightIcon size={14} />
          </button>
        </footer>
        </div>
      </div>
    </div>
  );
}
