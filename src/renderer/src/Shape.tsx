import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData, TodoItem } from "@shared/types";
import type { FirstStepState } from "@shared/firstStep";
import { localDate } from "@shared/todos";
import { defaultMinutes, normalizeMix, sizeLabel, splitWords, type ShapeInput, type ToolResult, type ToolSource, type WordChip } from "@shared/shape";
import { MCP_SERVICES, MCP_SOURCES, type McpSource } from "@shared/mcp";
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
  loading: "Reading…",
  "needs-auth": "Needs sign-in · open Settings",
};

const OPEN_LABEL: Record<string, string> = { shortcut: "Open in Figma", file: "Open file", calendar: "Open Calendar" };
const isMcp = (s: string): s is McpSource => s in MCP_SERVICES;
const SKIP_AFTER_MS = 15_000;

function dayName(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

// 첫 행동 빚기. C1(낱말·도구·크기·비율을 고름)과 C2(결과)를 메뉴바 목록 창 안에서 그린다.
export function ShapePanel({ todo, data, state, auto, onClose }: { todo: TodoItem; data: AppData; state?: FirstStepState; auto?: boolean; onClose: () => void }) {
  const today = localDate();
  const [words, setWords] = useState<WordChip[]>(() => splitWords(todo.title, todo.rawText));
  const [local, setLocal] = useState<ToolResult[] | null>(null);
  const mcpOn = MCP_SOURCES.filter((s) => data.settings.tools.mcp[s]);
  const [mcp, setMcp] = useState<Partial<Record<McpSource, ToolResult>>>(() =>
    Object.fromEntries(mcpOn.map((s) => [s, { source: s, status: "loading", item: null }])),
  );
  const [picked, setPicked] = useState<Set<ToolSource> | null>(null);
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [minutes, setMinutes] = useState<number | null>(null);
  const [mix, setMix] = useState<Record<string, number> | null>(null);
  const [toToday, setToToday] = useState(true);
  const autoSent = useRef(false);

  const onWords = useMemo(() => words.filter((w) => w.on).map((w) => w.word), [words]);
  const wordKey = onWords.join("\u0000");

  // 낱말이 바뀌면 잠시 기다렸다가 도구를 다시 읽는다. MCP는 한 번에 10초쯤 걸리고 구독 사용량을 쓰므로 더 오래 기다린다.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api.collectTools(todo.id, onWords).then((r) => live && setLocal(r));
    }, local ? 350 : 0);
    const first = !mcpStarted.current;
    mcpStarted.current = true;
    const tm = setTimeout(
      () => {
        for (const s of mcpOn) {
          setMcp((m) => ({ ...m, [s]: { source: s, status: "loading", item: null } }));
          api.collectMcp(todo.id, s, onWords).then((r) => live && setMcp((m) => ({ ...m, [s]: r })));
        }
      },
      first ? 0 : 1200,
    );
    return () => {
      live = false;
      clearTimeout(t);
      clearTimeout(tm);
    };
  }, [todo.id, wordKey]);
  const mcpStarted = useRef(false);
  useEffect(() => () => api.cancelMcp(todo.id), [todo.id]);

  const tools = local === null ? null : [...local, ...mcpOn.map((s) => mcp[s] ?? { source: s, status: "loading" as const, item: null })];
  const wanted = (s: ToolSource) => (picked ? picked.has(s) : true);
  const waiting = (tools ?? []).filter((r) => r.status === "loading" && wanted(r.source));
  const found = (tools ?? []).filter((r) => r.status === "ok");
  const foundKey = found.map((r) => `${r.source}:${r.item?.label}`).join("|");
  const selected = found.filter((r) => wanted(r.source)).map((r) => r.source);
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
        .map((r) => ({ source: r.source, label: r.item!.label, ...(r.item!.text && { text: r.item!.text }), date: r.item!.date, weight: m[r.source] ?? 0 })),
      claudeWeight: m.claude ?? 100,
    };
  };
  const send = () => api.requestFirstStep(todo.id, { shape: shape() });
  // MCP가 아직 읽는 중이면 끝날 때까지 기다렸다가 보낸다. 15초가 지나면 그 도구를 빼고 보낼 수 있다.
  const shapeIt = () => {
    if (waiting.length) setWaitingSince(Date.now());
    else send();
  };
  useEffect(() => {
    if (waitingSince !== null && waiting.length === 0 && mixFits) {
      setWaitingSince(null);
      send();
    }
  }, [waitingSince, waiting.length, mixFits]);
  useEffect(() => {
    if (waitingSince === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waitingSince]);
  const skipWaiting = () =>
    setPicked((p) => {
      const next = new Set(p ?? (tools ?? []).map((r) => r.source));
      for (const r of waiting) next.delete(r.source);
      return next;
    });

  useEffect(() => {
    if (auto && tools && mixFits && !autoSent.current) {
      autoSent.current = true;
      shapeIt();
    }
  }, [auto, tools, mixFits]);

  const busy = state?.status === "loading" || waitingSince !== null;
  const toggleTool = (s: ToolSource) =>
    setPicked((p) => {
      const next = new Set(p ?? (tools ?? []).map((r) => r.source));
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
            {state.sources.every((s) => s.source === "claude") &&
              (state.shape.context.length === 0 && (tools ?? []).length > 0 ? (
                <p className="result__hint">Made from general knowledge only — nothing in your tools matched these words. Try picking other words.</p>
              ) : (
                <p className="result__hint">
                  Made from general knowledge only.{" "}
                  <button type="button" className="link" onClick={() => api.openSettings("tools")}>
                    Turn on tools
                  </button>{" "}
                  for a step from your own files and notes.
                </p>
              ))}
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
                <SourceIcon source={top.source} size={12} /> {top.open.kind === "url" ? `Open in ${MCP_SERVICES[top.open.source].name.replace(" frame", "")}` : OPEN_LABEL[top.open.kind]}
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
                const loading = r.status === "loading";
                const on = (r.status === "ok" && selected.includes(r.source)) || (loading && wanted(r.source));
                return (
                  <button
                    type="button"
                    key={r.source}
                    className={`tool${on ? " is-on" : ""}${loading ? " is-loading" : ""}`}
                    disabled={r.status !== "ok" && !loading && r.status !== "needs-auth"}
                    aria-pressed={on}
                    onClick={() => (r.status === "needs-auth" ? api.openSettings("tools") : toggleTool(r.source))}
                  >
                    <span className="tool__top">
                      <span className="tool__icon">
                        <SourceIcon source={r.source} size={12} />
                      </span>
                      <span className="tool__name">{SOURCE_NAME[r.source]}</span>
                      <span className={`toggle toggle--sm${on ? " is-on" : ""}`} />
                    </span>
                    <span className="tool__item">
                      {loading && <Spinner size={10} />}{" "}
                      {r.item?.label ?? (r.source === "figma" && r.status === "empty" && data.shortcuts.length === 0 ? "No shortcuts yet" : TOOL_DESC[r.status])}
                    </span>
                    {isMcp(r.source) ? <span className="badge badge--mcp">MCP · read only</span> : <span className="badge">Local</span>}
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
        {waitingSince !== null && now - waitingSince > SKIP_AFTER_MS ? (
          <button type="button" className="text-button" onClick={skipWaiting}>
            Skip {waiting.map((r) => MCP_SERVICES[r.source as McpSource]?.name ?? r.source).join(", ")}
          </button>
        ) : (
          <span className="shape__note">
            {mcpOn.length ? "MCP reads via Claude Code" : "Sends titles only"} · {sizeLabel(size)}
          </span>
        )}
        <span className="spacer" />
        <button type="button" className="button button--primary" disabled={busy || tools === null} onClick={shapeIt}>
          {busy ? <Spinner size={12} /> : <AiSparkle size={12} />}{" "}
          {waitingSince !== null ? `Waiting for ${waiting.map((r) => MCP_SERVICES[r.source as McpSource]?.name ?? r.source).join(", ")}` : busy ? "Shaping…" : "Shape it"}
        </button>
      </footer>
    </div>
  );
}
