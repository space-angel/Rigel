import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AppData, Shortcut, TodoItem } from "@shared/types";
import { localDate, pendingCarryOver, todayView } from "@shared/todos";
import { displayAccelerator } from "@shared/hotkey";
import type { FirstStepState } from "@shared/firstStep";
import { AiSparkle, ArrowRightIcon, CalendarIcon, CheckIcon, ChevronRightIcon, FigmaMark, PlayIcon, PlusIcon, SettingsIcon } from "./components/icons";
import { FirstStepCard } from "./FirstStepCard";

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

function NowCard({
  item,
  shortcut,
  selected,
  onToggle,
  onFirstStep,
}: {
  item: TodoItem;
  shortcut?: Shortcut;
  selected: boolean;
  onToggle: () => void;
  onFirstStep: () => void;
}) {
  return (
    <div className={`now-card${selected ? " is-selected" : ""}`} onClick={item.isClear ? undefined : onFirstStep}>
      <div className="now-card__top">
        <span className="eyebrow">Now</span>
        <Checkbox checked={false} onToggle={onToggle} variant="now" />
      </div>
      <p className="now-card__title">{item.title}</p>
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
        <button type="button" className="pill-question">
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
}: {
  item: TodoItem;
  shortcut?: Shortcut;
  selected?: boolean;
  done?: boolean;
  trailing?: React.ReactNode;
  onToggle: () => void;
  onFirstStep?: () => void;
}) {
  const unclear = !item.isClear && !done;
  return (
    <div
      className={`row${selected ? " is-selected" : ""}${done ? " is-done" : ""}${unclear ? " is-unclear" : ""}`}
      onClick={unclear ? onFirstStep : undefined}
    >
      <Checkbox checked={Boolean(done)} onToggle={onToggle} />
      {unclear && <span className="row__dot" aria-label="Unclear" />}
      <span className="row__title">{item.title}</span>
      {unclear && onFirstStep && (
        <span className="row__hint">
          <AiSparkle size={12} /> First step
        </span>
      )}
      {shortcut && !done && <StartButton shortcut={shortcut} />}
      {trailing}
    </div>
  );
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
  const [laterOpen, setLaterOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [firstSteps, setFirstSteps] = useState<FirstStepState[]>([]);
  const shellRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getData().then(setData);
    api.getFirstSteps().then(setFirstSteps);
    const offData = api.onData(setData);
    const offFirst = api.onFirstSteps(setFirstSteps);
    const offOpen = api.onListOpened(() => {
      setSelected(0);
      rootRef.current?.focus();
    });
    return () => {
      offData();
      offOpen();
      offFirst();
    };
  }, []);

  // 카드 높이에 맞춰 창 높이를 바꾼다. 위아래 그림자 여백을 더한다.
  const hasData = data !== null;
  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => api.resizeList(el.getBoundingClientRect().height + 8 + 28));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);

  const carry = useMemo(() => (data ? pendingCarryOver(data, localDate()) : []), [data]);
  const view = useMemo(() => (data ? todayView(data.todos, localDate(), carry) : null), [data, carry]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (!data || !view) return null;
  const { open, done, later, unclearCount } = view;
  const [now, ...rest] = open;

  const act = (a: Parameters<typeof api.act>[0]) => api.act(a).then(setData);
  const stepOf = (id: string) => firstSteps.find((f) => f.todoId === id);
  const shortcutOf = (t: TodoItem) => (t.shortcutId ? data.shortcuts.find((s) => s.id === t.shortcutId) : undefined);
  const askFirstStep = (t: TodoItem) => {
    if (!stepOf(t.id)) api.requestFirstStep(t.id);
  };
  const stepCard = (t: TodoItem) => {
    const st = stepOf(t.id);
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
    const current = open[selected];
    if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, open.length - 1));
    else if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
    else if (e.key === " " && current) act({ type: "toggle", id: current.id });
    else if (e.key === "Enter" && current && !current.isClear) askFirstStep(current);
    else if (e.key === "Enter" && current && shortcutOf(current)) api.openShortcut(current.shortcutId!);
    else if (e.key === "," && e.metaKey) api.openSettings();
    else if (e.key === "Backspace" && e.metaKey && current) act({ type: "remove", id: current.id });
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

        <div className="scroll">
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
                    <NowCard item={now} shortcut={shortcutOf(now)} selected={selected === 0} onToggle={() => act({ type: "toggle", id: now.id })} onFirstStep={() => askFirstStep(now)} />
                  </SortableItem>
                )}
                {now && stepCard(now)}
                {rest.map((t, i) => (
                  <div key={t.id}>
                    <SortableItem id={t.id}>
                      <Row item={t} shortcut={shortcutOf(t)} selected={selected === i + 1} onToggle={() => act({ type: "toggle", id: t.id })} onFirstStep={() => askFirstStep(t)} />
                    </SortableItem>
                    {stepCard(t)}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {done.length > 0 && (
            <section className="section">
              <h2 className="section__label">Done {done.length}</h2>
              {done.map((t) => (
                <Row key={t.id} item={t} done onToggle={() => act({ type: "toggle", id: t.id })} />
              ))}
            </section>
          )}

          {later.length > 0 && (
            <section className="section">
              <button type="button" className="section__toggle" onClick={() => setLaterOpen((v) => !v)} aria-expanded={laterOpen}>
                Later <span className="section__count">{later.length}</span>
                <ChevronRightIcon size={12} className={laterOpen ? "is-open" : ""} />
              </button>
              {laterOpen &&
                later.map((t) => (
                  <Row
                    key={t.id}
                    item={t}
                    onToggle={() => act({ type: "toggle", id: t.id })}
                    trailing={
                      <button type="button" className="small-button" onClick={() => act({ type: "moveToToday", id: t.id })}>
                        Today
                      </button>
                    }
                  />
                ))}
            </section>
          )}
        </div>

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
