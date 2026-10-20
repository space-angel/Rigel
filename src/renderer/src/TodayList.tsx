import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AppData, Shortcut, TodoItem } from "@shared/types";
import { localDate, pendingCarryOver, todayView } from "@shared/todos";
import { displayAccelerator } from "@shared/hotkey";
import type { FirstStepState } from "@shared/firstStep";
import { AiSparkle, ArrowRightIcon, CalendarIcon, CheckIcon, ChevronRightIcon, FigmaMark, MoreIcon, PlayIcon, PlusIcon, SettingsIcon } from "./components/icons";
import { FirstStepCard } from "./FirstStepCard";
import { ShapePanel } from "./Shape";
import { Attachments } from "./components/Attachments";
import { dueBadge, dueLabel } from "@shared/due";

// 마감 배지. 줄에서는 짧게(D-3), 지금 할 일 카드에서는 말로(3 days left).
function Due({ item, long }: { item: TodoItem; long?: boolean }) {
  if (!item.dueDate || item.completedAt) return null;
  const today = localDate();
  const b = long ? dueLabel(item.dueDate, today) : dueBadge(item.dueDate, today);
  return (
    <span className={`due-badge due-badge--${b.tone}`} title={`Due ${item.dueDate}`}>
      {b.text}
    </span>
  );
}
import { FanDial } from "./components/FanDial";
import { RatioBar } from "./components/RatioBar";
import { DIAL_LABEL, DIAL_VIEWS, dialBuckets, dialRatio, type DialView } from "@shared/dial";

const api = window.todoban;

function dateLabel(d = new Date()): string {
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
      {checked && <CheckIcon size={11} />}
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
      aria-label={`Open ${shortcut.name}`}
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
      aria-label="Task title"
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
      aria-label="More actions"
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
}: {
  item: TodoItem;
  shortcut?: Shortcut;
  selected: boolean;
  onToggle: () => void;
  onFirstStep: () => void;
  onShape: () => void;
  edit: EditProps;
  isNew?: boolean;
}) {
  const click = useSingleClick(item.isClear || edit.editing ? undefined : onShape);
  return (
    <div
      className={`now-card${selected ? " is-selected" : ""}${isNew ? " is-new" : ""}`}
      {...click}
      onContextMenu={(e) => {
        e.preventDefault();
        edit.onMenu();
      }}
    >
      <div className="now-card__top">
        <span className="now-card__eyebrow">
          <span className="eyebrow">Now</span>
          <Due item={item} long />
        </span>
        <span className="now-card__tools">
          <MoreButton onMenu={edit.onMenu} />
          <Checkbox checked={false} onToggle={onToggle} variant="now" />
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
            <span className="now-card__sub">Ready to start</span>
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
          <AiSparkle size={12} /> Let Claude find a first step
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
}) {
  const unclear = !item.isClear && !done;
  const click = useSingleClick(unclear && !edit.editing ? onFirstStep : undefined);
  return (
    <div
      className={`row${selected ? " is-selected" : ""}${done ? " is-done" : ""}${unclear ? " is-unclear" : ""}${edit.editing ? " is-editing" : ""}${isNew ? " is-new" : ""}`}
      {...click}
      onContextMenu={(e) => {
        e.preventDefault();
        edit.onMenu();
      }}
    >
      <Checkbox checked={Boolean(done)} onToggle={onToggle} />
      {unclear && <span className="row__dot" aria-label="Unclear" />}
      <Title item={item} className="row__title" {...edit} />
      {!edit.editing && (
        <>
          <Due item={item} />
          {unclear && onFirstStep && (
            <span className="row__hint">
              <AiSparkle size={12} /> Shape
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
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
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
  const [dial, setDial] = useState<DialView>("today");
  const [selected, setSelected] = useState(0);
  const [firstSteps, setFirstSteps] = useState<FirstStepState[]>([]);
  // 빚기(C1, C2)를 열어 둔 할 일. auto면 바로 Shape it을 누른다(화면 확인용).
  const [shaping, setShaping] = useState<{ id: string; auto: boolean } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 제자리에서 고치는 중인 할 일, 방금 지워서 되살릴 수 있는 할 일
  const [editingId, setEditingId] = useState<string | null>(null);
  const [undo, setUndo] = useState<TodoItem | null>(null);
  // 방금 넣은 할 일. 목록이 열릴 때 그 묶음으로 다이얼을 돌리고, 잠깐 빛나게 한다.
  const [highlight, setHighlight] = useState<string[]>([]);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<AppData | null>(null);
  dataRef.current = data;

  useEffect(() => {
    api.getData().then(setData);
    api.getFirstSteps().then(setFirstSteps);
    const offData = api.onData(setData);
    const offFirst = api.onFirstSteps(setFirstSteps);
    const offOpen = api.onListOpened((opts) => {
      setSelected(0);
      setDial("today");
      setShaping(null);
      rootRef.current?.focus();
      if (opts?.highlight?.length) setHighlight(opts.highlight);
    });
    const offShape = api.onShapeOpen((id, auto) => setShaping({ id, auto }));
    // ⋯ 메뉴나 오른쪽 클릭 메뉴에서 고르면 메인이 알려 준다.
    const offRequest = api.onTodoRequest((kind, id) => {
      if (kind === "edit") setEditingId(id);
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
  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => api.resizeList(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);

  // 키보드로 고른 줄이 목록 영역 밖으로 나가면 그 줄이 보이도록 스크롤한다.
  useEffect(() => {
    const el = scrollRef.current?.querySelector(".is-selected");
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [selected, dial]);

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
  const turnDial = (v: DialView) => {
    setDial(v);
    setSelected(0);
  };

  const act = (a: Parameters<typeof api.act>[0]) => api.act(a).then(setData);
  const stepOf = (id: string) => firstSteps.find((f) => f.todoId === id);
  const shortcutOf = (t: TodoItem) => (t.shortcutId ? data.shortcuts.find((s) => s.id === t.shortcutId) : undefined);
  const askFirstStep = (t: TodoItem) => {
    if (!stepOf(t.id)) api.requestFirstStep(t.id);
  };
  const shape = (t: TodoItem) => setShaping({ id: t.id, auto: false });
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
    if (!over || active.id === over.id) return;
    const ids = open.map((t) => t.id);
    const moved = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    const i = moved.indexOf(String(active.id));
    act({ type: "reorder", id: String(active.id), beforeId: moved[i - 1] ?? null, afterId: moved[i + 1] ?? null });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (shaping) {
      if (e.key === "Escape") setShaping(null);
      return;
    }
    const current = rows[selected];
    const di = DIAL_VIEWS.indexOf(dial);
    if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, rows.length - 1));
    else if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
    else if (e.key === "ArrowLeft" && di > 0) turnDial(DIAL_VIEWS[di - 1]!);
    else if (e.key === "ArrowRight" && di < DIAL_VIEWS.length - 1) turnDial(DIAL_VIEWS[di + 1]!);
    else if (e.key === " " && current) act({ type: "toggle", id: current.id });
    else if (e.key === "Enter" && current && !current.isClear && !current.completedAt) (dial === "today" ? askFirstStep(current) : shape(current));
    else if (e.key === "Enter" && current && shortcutOf(current)) api.openShortcut(current.shortcutId!);
    else if (e.key === "," && e.metaKey) api.openSettings();
    else if (e.key === "Backspace" && e.metaKey && current) remove(current);
    // 한글 입력 중에도 되도록 글자 대신 키 자리(code)로 본다.
    else if (e.code === "KeyE" && e.metaKey && current) setEditingId(current.id);
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
        <div className="shell" ref={shellRef}>
          <ShapePanel
            key={shapingTodo.id}
            todo={shapingTodo}
            data={data}
            state={stepOf(shapingTodo.id)}
            auto={shaping.auto}
            onClose={() => {
              setShaping(null);
              rootRef.current?.focus();
            }}
          />
        </div>
      </div>
    );

  return (
    <div className="window" ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="shell" ref={shellRef}>
        <header className="header">
          <div className="header__title">
            <h1>Today</h1>
            <div className="header__sub">
              <span>{dateLabel()}</span>
              {open.length > 0 && <span>· {open.length} open</span>}
              {unclearCount > 0 && <span className="chip">{unclearCount} unclear</span>}
            </div>
          </div>
          <button type="button" className="icon-button" aria-label="Add task" onClick={() => captureRef.current?.focus()}>
            <PlusIcon size={14} />
          </button>
          <button type="button" className="icon-button" aria-label="Settings" onClick={() => api.openSettings()}>
            <SettingsIcon size={14} />
          </button>
        </header>

        <div className="overview">
          <FanDial
            variant="bare"
            label="Which tasks to show"
            items={DIAL_VIEWS.map((v) => ({ key: v, label: DIAL_LABEL[v], muted: v !== "today" && buckets[v].length === 0 }))}
            value={dial}
            onChange={turnDial}
          />
          <RatioBar view={dial} parts={dialRatio(dial, buckets)} />
        </div>

        <div className="scroll" ref={scrollRef}>
          {dial !== "today" ? (
            <section className="section section--view">
              <h2 className="section__label">
                {DIAL_LABEL[dial]} · {buckets[dial].length}
              </h2>
              {buckets[dial].length === 0 && <p className="section__empty">Nothing here.</p>}
              {buckets[dial].map((t, i) => (
                <Row
                  key={t.id}
                  item={t}
                  shortcut={shortcutOf(t)}
                  selected={selected === i}
                  done={dial === "done"}
                  onToggle={() => act({ type: "toggle", id: t.id })}
                  onFirstStep={() => shape(t)}
                  edit={edit(t)}
                  isNew={highlight.includes(t.id)}
                  trailing={
                    dial !== "done" && (
                      <>
                        {t.plannedDate && t.plannedDate !== t.dueDate && <span className="row__date">{shortDate(t.plannedDate)}</span>}
                        <button
                          type="button"
                          className="small-button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            act({ type: "moveToToday", id: t.id });
                          }}
                        >
                          → Today
                        </button>
                      </>
                    )
                  }
                />
              ))}
              <button type="button" className="section__toggle" onClick={() => turnDial("today")}>
                Back to Today <ChevronRightIcon size={12} />
              </button>
            </section>
          ) : (
            <>
          {carry.length > 0 && (
            <div className="carry">
              <div className="carry__top">
                <span className="eyebrow">
                  <CalendarIcon size={12} /> From yesterday
                </span>
                <span className="eyebrow eyebrow--count">{carry.length} left</span>
              </div>
              <p className="carry__title">Bring {carry.length === 1 ? "this task" : `these ${carry.length} tasks`} into today?</p>
              <p className="carry__desc">{carry.map((t) => t.title).join(" · ")}</p>
              <div className="carry__actions">
                <button type="button" className="button button--primary button--sm" onClick={() => act({ type: "carryOver", to: "today" })}>
                  Bring to today
                </button>
                <button type="button" className="text-button" onClick={() => act({ type: "carryOver", to: "later" })}>
                  Later
                </button>
              </div>
            </div>
          )}

          {open.length === 0 && carry.length === 0 && (
            <div className="empty">
              <span className="empty__mark">
                <CheckIcon size={18} />
              </span>
              <p className="empty__title">{done.length ? "All clear for today" : "Nothing for today yet"}</p>
              <p className="empty__sub">{done.length ? `${done.length} done. Capture the next thought below.` : "Write what's on your mind below."}</p>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="list">
                {now && (
                  <SortableItem id={now.id}>
                    <NowCard item={now} shortcut={shortcutOf(now)} selected={selected === 0} onToggle={() => act({ type: "toggle", id: now.id })} onFirstStep={() => askFirstStep(now)} onShape={() => shape(now)} edit={edit(now)} isNew={highlight.includes(now.id)} />
                  </SortableItem>
                )}
                {now && stepCard(now)}
                {rest.map((t, i) => (
                  <div key={t.id}>
                    <SortableItem id={t.id}>
                      <Row item={t} shortcut={shortcutOf(t)} selected={selected === i + 1} onToggle={() => act({ type: "toggle", id: t.id })} onFirstStep={() => shape(t)} edit={edit(t)} isNew={highlight.includes(t.id)} />
                    </SortableItem>
                    {stepCard(t)}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {(done.length > 0 || later.length > 0) && (
            <nav className="quiet-links">
              {(["done", "tomorrow", "later"] as const)
                .filter((v) => buckets[v].length > 0)
                .map((v) => (
                  <button type="button" key={v} className="section__toggle" onClick={() => turnDial(v)}>
                    {DIAL_LABEL[v]} <span className="section__count">{buckets[v].length}</span> <ChevronRightIcon size={12} />
                  </button>
                ))}
            </nav>
          )}
            </>
          )}
        </div>

        {undo && (
          <div className="toast" role="status">
            <span className="toast__text">
              Deleted “{undo.title}”
            </span>
            <button type="button" className="toast__undo" onClick={restore}>
              Undo <kbd>⌘Z</kbd>
            </button>
          </div>
        )}
        <footer className="capture">
          <AiSparkle size={14} className="capture__icon" />
          <input
            ref={captureRef}
            value={draft}
            placeholder="Capture a thought…"
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
          <button type="button" className="capture__send" aria-label="Add" disabled={!draft.trim()} onClick={submitDraft}>
            <ArrowRightIcon size={14} />
          </button>
        </footer>
      </div>
    </div>
  );
}
