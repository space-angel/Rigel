import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData, TodoItem } from "@shared/types";
import type { FirstStepState } from "@shared/firstStep";
import { localDate } from "@shared/todos";
import { defaultMinutes, normalizeMix, sizeLabel, splitWords, type LocalSource, type ShapeInput, type ToolResult, type WordChip } from "@shared/shape";
import { AiSparkle, ChevronLeftIcon, RefreshIcon, Spinner } from "./components/icons";
import { SizeDial } from "./components/SizeDial";
import { MixBar } from "./components/MixBar";
import { SOURCE_NAME, SourceIcon } from "./components/SourceIcon";
import { FirstStepCard } from "./FirstStepCard";

const api = window.todoban;

const TOOL_DESC: Record<string, string> = {
  slow: "Took too long",
  denied: "Allow Calendar in System Settings",
  failed: "Couldn't read",
  empty: "Nothing matched",
};

const OPEN_LABEL: Record<string, string> = { shortcut: "Open in Figma", file: "Open file", calendar: "Open Calendar" };

function dayName(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

// 첫 행동 빚기. C1(낱말·도구·크기·비율을 고름)과 C2(결과)를 메뉴바 목록 창 안에서 그린다.
export function ShapePanel({ todo, data, state, auto, onClose }: { todo: TodoItem; data: AppData; state?: FirstStepState; auto?: boolean; onClose: () => void }) {
  const today = localDate();
  const [words, setWords] = useState<WordChip[]>(() => splitWords(todo.title, todo.rawText));
  const [tools, setTools] = useState<ToolResult[] | null>(null);
  const [picked, setPicked] = useState<Set<LocalSource> | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [mix, setMix] = useState<Record<string, number> | null>(null);
  const [toToday, setToToday] = useState(true);
  const autoSent = useRef(false);

  const onWords = useMemo(() => words.filter((w) => w.on).map((w) => w.word), [words]);
  const wordKey = onWords.join("\u0000");

  // 낱말이 바뀌면 잠시 기다렸다가 도구를 다시 읽는다.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api.collectTools(todo.id, onWords).then((r) => live && setTools(r));
    }, tools ? 350 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [todo.id, wordKey]);

  const found = (tools ?? []).filter((r) => r.status === "ok");
  const foundKey = found.map((r) => `${r.source}:${r.item?.label}`).join("|");
  const selected = found.filter((r) => (picked ? picked.has(r.source) : true)).map((r) => r.source);
  const selectedKey = selected.join(",");
  const deadline = found.find((r) => r.source === "calendar" && selected.includes("calendar"))?.item?.date ?? null;
  const dial = defaultMinutes(deadline, today);

  // 고른 도구가 바뀌면 비율을 기본값에서 다시 나눈다.
  useEffect(() => {
    setMix(normalizeMix(data.settings.tools.defaultMix, selected));
  }, [selectedKey, foundKey]);

  const size = minutes ?? dial.minutes;
  // 비율은 고른 도구가 바뀐 뒤 한 번 늦게 다시 계산된다. 칸이 안 맞는 비율이면 버리고 기본값에서 새로 나눈다.
  const mixFits = mix !== null && Object.keys(mix).sort().join() === [...selected, "claude"].sort().join();
  const currentMix = mixFits ? mix : normalizeMix(data.settings.tools.defaultMix, selected);
  const shape = (): ShapeInput => {
    const m = currentMix;
    return {
      words: onWords,
      minutes: size,
      context: found
        .filter((r) => selected.includes(r.source))
        .map((r) => ({ source: r.source, label: r.item!.label, date: r.item!.date, weight: m[r.source] ?? 0 })),
      claudeWeight: m.claude ?? 100,
    };
  };
  const send = () => api.requestFirstStep(todo.id, { shape: shape() });

  useEffect(() => {
    if (auto && tools && mixFits && !autoSent.current) {
      autoSent.current = true;
      send();
    }
  }, [auto, tools, mixFits]);

  const busy = state?.status === "loading";
  const toggleTool = (s: LocalSource) =>
    setPicked((p) => {
      const next = new Set(p ?? found.map((r) => r.source));
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const header = (title: string) => (
    <header className="shape__head">
      <button type="button" className="back" onClick={onClose}>
        <ChevronLeftIcon size={12} /> Today
      </button>
      <h1>{title}</h1>
      <span className="task-chip">
        <span className="task-chip__dot" /> {todo.title}
      </span>
    </header>
  );

  // C2: 결과
  if (state?.status === "suggestion" && state.shape) {
    const used = state.shape.words.filter((w) => state.title!.includes(w));
    const claude = state.sources.find((s) => s.source === "claude");
    const top = [...state.sources]
      .filter((s) => s.source !== "claude")
      .sort((a, b) => b.weight - a.weight)
      .map((s) => found.find((r) => r.source === s.source)?.item)
      .find((item) => item?.open);
    const due = state.shape.context.find((c) => c.source === "calendar")?.date;
    return (
      <div className="shape">
        {header("Your first step")}
        <div className="shape__body">
          <div className="result">
            <div className="result__top">
              <span className="eyebrow">First step</span>
              {state.minutes && (
                <span className="due">
                  {state.minutes} min{due ? ` · before ${dayName(due)}` : ""}
                </span>
              )}
            </div>
            <p className="result__title">{state.title}</p>
            {state.sources.some((s) => s.source !== "claude") && (
              <>
                <span className="eyebrow">Made from</span>
                <div className="made">
                  {state.sources
                    .filter((s) => s.source !== "claude")
                    .map((s) => (
                      <div className="made__row" key={`${s.source}-${s.label}`}>
                        <span className="made__icon">
                          <SourceIcon source={s.source} size={12} />
                        </span>
                        <span className="made__label">{s.label}</span>
                        <span className="made__pct">{s.weight}%</span>
                      </div>
                    ))}
                </div>
              </>
            )}
            {(used.length > 0 || claude) && (
              <div className="result__words">
                {used.map((w) => (
                  <span className="word is-on" key={w}>
                    {w}
                  </span>
                ))}
                {claude && <span className="mono-label">+ Claude {claude.weight}%</span>}
              </div>
            )}
          </div>
          <div className="result__actions">
            {todo.plannedDate !== today && (
              <label className="pill-question">
                Swap into today
                <button type="button" role="switch" aria-checked={toToday} className={`toggle${toToday ? " is-on" : ""}`} onClick={() => setToToday((v) => !v)} />
              </label>
            )}
            {top?.open && (
              <button type="button" className="button button--secondary button--sm" onClick={() => api.openToolItem(top.open)}>
                <SourceIcon source={top.source} size={12} /> {OPEN_LABEL[top.open.kind]}
              </button>
            )}
          </div>
        </div>
        <footer className="shape__foot">
          <button type="button" className="text-button" onClick={() => api.requestFirstStep(todo.id, { again: true })}>
            <RefreshIcon size={12} /> Reshape
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              api.acceptFirstStep(todo.id, { toToday: todo.plannedDate !== today && toToday });
              onClose();
            }}
          >
            Use this step
          </button>
        </footer>
      </div>
    );
  }

  // C1: 고르기
  return (
    <div className="shape">
      {header("Shape with your tools")}
      <div className="shape__body">
        <section className="shape__section">
          <h2 className="eyebrow">01 · Your words</h2>
          <div className="words">
            {words.map((w, i) => (
              <button
                type="button"
                key={w.word}
                className={`word${w.on ? " is-on" : ""}`}
                aria-pressed={w.on}
                onClick={() => setWords((ws) => ws.map((x, k) => (k === i ? { ...x, on: !x.on } : x)))}
              >
                {w.word}
              </button>
            ))}
            {words.length === 0 && <p className="shape__empty">No words to pick — Claude will use the title.</p>}
          </div>
        </section>

        <section className="shape__section">
          <div className="shape__label-row">
            <h2 className="eyebrow">02 · Your tools</h2>
            {tools && tools.length > 0 && (
              <span className="eyebrow">
                {selected.length} of {tools.length} on
              </span>
            )}
          </div>
          {tools === null ? (
            <p className="shape__empty">
              <Spinner size={12} /> Reading your tools…
            </p>
          ) : tools.length === 0 ? (
            <p className="shape__empty">
              No tools on.{" "}
              <button type="button" className="link" onClick={() => api.openSettings("tools")}>
                Choose in Settings
              </button>
            </p>
          ) : (
            <div className="tools">
              {tools.map((r) => {
                const on = r.status === "ok" && selected.includes(r.source);
                return (
                  <button
                    type="button"
                    key={r.source}
                    className={`tool${on ? " is-on" : ""}`}
                    disabled={r.status !== "ok"}
                    aria-pressed={on}
                    onClick={() => toggleTool(r.source)}
                  >
                    <span className="tool__top">
                      <span className="tool__icon">
                        <SourceIcon source={r.source} size={12} />
                      </span>
                      <span className="tool__name">{SOURCE_NAME[r.source]}</span>
                      <span className={`toggle toggle--sm${on ? " is-on" : ""}`} />
                    </span>
                    <span className="tool__item">{r.item?.label ?? TOOL_DESC[r.status]}</span>
                    <span className="badge">Local</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="shape__section">
          <div className="shape__label-row">
            <h2 className="eyebrow">03 · How big?</h2>
            {dial.daysLeft !== null && minutes === null && (
              <span className="eyebrow">
                From calendar · {dial.daysLeft} {dial.daysLeft === 1 ? "day" : "days"} left
              </span>
            )}
          </div>
          <SizeDial value={size} onChange={setMinutes} />
        </section>

        {selected.length > 0 && (
          <section className="shape__section">
            <div className="shape__label-row">
              <h2 className="eyebrow">04 · Mix by source</h2>
              <span className="eyebrow">Drag edges</span>
            </div>
            <MixBar mix={currentMix} onChange={setMix} />
          </section>
        )}

        {state && state.status !== "loading" && <FirstStepCard state={state} originalTitle={todo.title} />}
      </div>
      <footer className="shape__foot">
        <span className="shape__note">Sends titles only · {sizeLabel(size)}</span>
        <span className="spacer" />
        <button type="button" className="button button--primary" disabled={busy || tools === null} onClick={send}>
          {busy ? <Spinner size={12} /> : <AiSparkle size={12} />} {busy ? "Shaping…" : "Shape it"}
        </button>
      </footer>
    </div>
  );
}
