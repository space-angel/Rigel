import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AppData, TodoItem } from "@shared/types";
import { localDate, todayView } from "@shared/todos";
import type { FirstStepState } from "@shared/firstStep";
import { AiSparkle, BrandMark, CheckIcon, ChevronRightIcon, PlusIcon, SettingsIcon } from "./components/icons";
import { FirstStepCard } from "./FirstStepCard";

const api = window.todoban;

function dateLabel(d = new Date()): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${"일월화수목금토"[d.getDay()]}`;
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
      {checked && <CheckIcon size={12} />}
    </button>
  );
}

function NowCard({ item, selected, onToggle, onFirstStep }: { item: TodoItem; selected: boolean; onToggle: () => void; onFirstStep: () => void }) {
  return (
    <div className={`now-card${selected ? " is-selected" : ""}`} onClick={item.isClear ? undefined : onFirstStep}>
      <div className="now-card__top">
        <span className="now-card__pill">지금 할 일</span>
        <Checkbox checked={false} onToggle={onToggle} variant="now" />
      </div>
      <p className="now-card__title">{item.title}</p>
      {item.isClear ? (
        <p className="now-card__sub">바로 시작할 수 있어요</p>
      ) : (
        <button type="button" className="now-card__cta">
          <AiSparkle size={12} /> 첫 행동 받기
        </button>
      )}
    </div>
  );
}

function Row({
  item,
  selected,
  done,
  trailing,
  onToggle,
  onFirstStep,
}: {
  item: TodoItem;
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
      {unclear && <span className="row__dot" aria-label="정리 필요" />}
      <span className="row__title">{item.title}</span>
      {unclear && onFirstStep && (
        <span className="row__hint">
          <AiSparkle size={12} /> 첫 행동 받기
        </span>
      )}
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
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [laterOpen, setLaterOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [firstSteps, setFirstSteps] = useState<FirstStepState[]>([]);
  const shellRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const view = useMemo(() => (data ? todayView(data.todos, localDate()) : null), [data]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (!data || !view) return null;
  const { open, done, later, unclearCount } = view;
  const [now, ...rest] = open;

  const act = (a: Parameters<typeof api.act>[0]) => api.act(a).then(setData);
  const stepOf = (id: string) => firstSteps.find((f) => f.todoId === id);
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
    if (adding) return;
    const current = open[selected];
    if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, open.length - 1));
    else if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
    else if (e.key === " " && current) act({ type: "toggle", id: current.id });
    else if (e.key === "Enter" && current && !current.isClear) askFirstStep(current);
    else if (e.key === "Backspace" && e.metaKey && current) act({ type: "remove", id: current.id });
    else if (e.key === "n" && e.metaKey) setAdding(true);
    else if (e.key === "Escape") api.hideList();
    else return;
    e.preventDefault();
  };

  const submitDraft = () => {
    if (draft.trim()) act({ type: "add", title: draft });
    setDraft("");
  };

  return (
    <div className="window" ref={rootRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="shell" ref={shellRef}>
        <header className="header">
          <BrandMark size={24} />
          <div className="header__title">
            <h1>{open.length ? `오늘 ${open.length}개` : "오늘"}</h1>
            <div className="header__sub">
              <span>{dateLabel()}</span>
              {unclearCount > 0 && <span className="chip">정리 필요 {unclearCount}</span>}
            </div>
          </div>
          <button type="button" className="icon-button" aria-label="할 일 추가" onClick={() => setAdding(true)}>
            <PlusIcon />
          </button>
          <button type="button" className="icon-button" aria-label="설정" disabled title="설정은 5단계에서 만들어요">
            <SettingsIcon />
          </button>
        </header>

        <div className="scroll">
          {adding && (
            <div className="add-row">
              <input
                autoFocus
                value={draft}
                placeholder="할 일을 적고 Enter"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) submitDraft();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setDraft("");
                    rootRef.current?.focus();
                  }
                  e.stopPropagation();
                }}
                onBlur={() => {
                  submitDraft();
                  setAdding(false);
                }}
              />
            </div>
          )}

          {open.length === 0 && !adding && (
            <div className="empty">
              <p className="empty__title">{done.length ? "오늘 할 일을 다 끝냈어요" : "오늘 할 일이 없어요"}</p>
              <p className="empty__sub">⌥ Space로 떠오른 생각을 적어 두세요</p>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="list">
                {now && (
                  <SortableItem id={now.id}>
                    <NowCard item={now} selected={selected === 0} onToggle={() => act({ type: "toggle", id: now.id })} onFirstStep={() => askFirstStep(now)} />
                  </SortableItem>
                )}
                {now && stepCard(now)}
                {rest.map((t, i) => (
                  <div key={t.id}>
                    <SortableItem id={t.id}>
                      <Row item={t} selected={selected === i + 1} onToggle={() => act({ type: "toggle", id: t.id })} onFirstStep={() => askFirstStep(t)} />
                    </SortableItem>
                    {stepCard(t)}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {done.length > 0 && (
            <section className="section">
              <h2 className="section__label">끝낸 할 일 {done.length}</h2>
              {done.map((t) => (
                <Row key={t.id} item={t} done onToggle={() => act({ type: "toggle", id: t.id })} />
              ))}
            </section>
          )}
        </div>

        {later.length > 0 && (
          <>
        <div className="divider" />
        <section className="section section--later">
          <button type="button" className="section__toggle" onClick={() => setLaterOpen((v) => !v)} aria-expanded={laterOpen}>
            <ChevronRightIcon size={14} className={laterOpen ? "is-open" : ""} />
            나중 <span className="section__count">{later.length}</span>
          </button>
          {laterOpen &&
            later.map((t) => (
              <Row
                key={t.id}
                item={t}
                onToggle={() => act({ type: "toggle", id: t.id })}
                trailing={
                  <button type="button" className="small-button" onClick={() => act({ type: "moveToToday", id: t.id })}>
                    오늘로
                  </button>
                }
              />
            ))}
        </section>
          </>
        )}

        <div className="divider" />
        <footer className="footer">
          <kbd>⌥ Space</kbd>
          <span>빠른 입력</span>
          <span className="footer__hint">↑↓ 이동 · Space 체크 · ↵ 첫 행동</span>
        </footer>
      </div>
    </div>
  );
}
