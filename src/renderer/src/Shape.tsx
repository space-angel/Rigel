import { msg } from "@shared/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData, TodoItem } from "@shared/types";
import type { FirstStepState } from "@shared/firstStep";
import { localDate } from "@shared/todos";
import { defaultMinutes, noteOpen, normalizeMix, sizeLabel, splitWords, toNote, type ShapeInput, type ToolResult, type ToolSource, type WordChip } from "@shared/shape";
import { MCP_SERVICES, MCP_SOURCES, type McpSource } from "@shared/mcp";
import { AiSparkle, CheckIcon, ChevronLeftIcon, RefreshIcon, Spinner } from "./components/icons";
import { SizeDial } from "./components/SizeDial";
import { MixBar } from "./components/MixBar";
import { SourceIcon, sourceName } from "./components/SourceIcon";
import { currentLang, loc, t } from "./i18n";
import { FirstStepCard, FirstStepProgress } from "./FirstStepCard";
import { RigelLoader } from "./components/RigelLoader";
import { sourceColors } from "./components/sourceColors";
import { Evidence } from "./components/Evidence";

const api = window.todoban;

const TOOL_DESC: Record<string, string> = {
  slow: msg("Took too long"),
  denied: msg("Allow Calendar in System Settings"),
  failed: msg("Couldn't read"),
  empty: msg("Nothing matched"),
  loading: msg("Reading…"),
  "needs-auth": msg("Needs sign-in · open Settings"),
};

const OPEN_LABEL: Record<string, string> = { shortcut: msg("Open in Figma"), figma: msg("Open in Figma"), file: msg("Open file"), calendar: msg("Open Calendar") };
const isMcp = (s: string): s is McpSource => s in MCP_SERVICES;
const SKIP_AFTER_MS = 15_000;

function dayName(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(loc(), { weekday: "short" }).toUpperCase();
}

// 첫 행동 빚기. C1(낱말·도구·크기·비율을 고름)과 C2(결과)를 메뉴바 목록 창 안에서 그린다.
export function ShapePanel({ todo, data, state, auto, onClose }: { todo: TodoItem; data: AppData; state?: FirstStepState; auto?: boolean; onClose: () => void }) {
  const today = localDate();
  const [words, setWords] = useState<WordChip[]>(() => splitWords(todo.title, todo.rawText));
  const [local, setLocal] = useState<ToolResult[] | null>(null);
  const mcpOn = MCP_SOURCES.filter((s) => data.settings.tools.mcp[s]);
  // 확인 창에서 붙여 둔 자료가 있으면 다시 읽지 않고 그대로 쓴다. 낱말을 바꾸면 그때 다시 읽는다.
  const stored = (s: McpSource): ToolResult | null => {
    const n = todo.context.find((c) => c.source === s);
    if (!n) return null;
    return {
      source: s,
      status: "ok",
      item: { source: s, label: n.label, text: n.text, date: n.date, open: noteOpen(n), ...(n.workspace && { workspace: n.workspace }), ...(n.where && { where: n.where }) },
    };
  };
  const [mcp, setMcp] = useState<Partial<Record<McpSource, ToolResult>>>(() =>
    Object.fromEntries(mcpOn.map((s) => [s, stored(s) ?? { source: s, status: "loading", item: null }])),
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
          if (first && stored(s)) continue;
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
  // 크기 기본값은 가까운 마감으로 정한다: 할 일의 마감, 또는 캘린더에서 찾은 일정.
  const calendarDate = found.find((r) => r.source === "calendar" && selected.includes("calendar"))?.item?.date ?? null;
  const deadline = [todo.dueDate, calendarDate].filter((d): d is string => Boolean(d)).sort()[0] ?? null;
  const deadlineFrom = deadline && deadline === todo.dueDate ? t("Due") : t("From calendar");
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
  // 근거 하나를 빼고 다시 빚는다. 고른 도구가 바뀐 뒤 비율이 다시 계산되면 보낸다.
  const [reshapeWithout, setReshapeWithout] = useState<ToolSource | null>(null);
  const leaveOut = (s: ToolSource) => {
    setPicked((p) => {
      const next = new Set(p ?? (tools ?? []).map((r) => r.source));
      next.delete(s);
      return next;
    });
    setReshapeWithout(s);
  };
  useEffect(() => {
    if (reshapeWithout && !selected.includes(reshapeWithout) && mixFits) {
      setReshapeWithout(null);
      send();
    }
  }, [reshapeWithout, selectedKey, mixFits]);
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
        <ChevronLeftIcon size={12} /> {t("Today")}
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
    const due = todo.dueDate ?? state.shape.context.find((c) => c.source === "calendar")?.date;
    return (
      <div className="shape">
        {header(t("Your first step"))}
        <div className="shape__body">
          <div className="result motion-rise">
            <div className="result__top">
              <span className="eyebrow">{t("First step")}</span>
              {state.minutes && (
                <span className="due">
                  {sizeLabel(state.minutes, currentLang())}{due ? ` · ${t("before {day}", { day: dayName(due) })}` : ""}
                </span>
              )}
            </div>
            <p className="result__title">{state.title}</p>
            {state.sources.some((s) => s.source !== "claude") && (
              <>
                <span className="eyebrow">{t("Made from")}</span>
                <div className="made">
                  {state.sources
                    .filter((s) => s.source !== "claude")
                    .map((s, i) => (
                      <Evidence
                        index={i + 1}
                        key={`${s.source}-${s.label}`}
                        source={s.source}
                        label={s.label}
                        weight={s.weight}
                        item={found.find((r) => r.source === s.source)?.item ?? undefined}
                        words={state.shape!.words}
                        onLeaveOut={() => leaveOut(s.source as ToolSource)}
                      />
                    ))}
                </div>
              </>
            )}
            {state.sources.every((s) => s.source === "claude") &&
              (state.shape.context.length === 0 && found.length > 0 ? (
                <p className="result__hint">{t("Made from general knowledge only — you left your material out.")}</p>
              ) : state.shape.context.length === 0 && (tools ?? []).length > 0 ? (
                <p className="result__hint">{t("Made from general knowledge only — nothing in your tools matched these words. Try picking other words.")}</p>
              ) : (
                <p className="result__hint">
                  {t("Made from general knowledge only.")}{" "}
                  <button type="button" className="link" onClick={() => api.openSettings("tools")}>
                    {t("Turn on tools")}
                  </button>
                  {t(" for a step from your own files and notes.")}
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
          <div className="result__actions motion-rise" style={{ "--i": 3 } as React.CSSProperties}>
            {todo.plannedDate !== today && (
              <label className="pill-question">
                {t("Swap into today")}
                <button type="button" role="switch" aria-checked={toToday} className={`toggle${toToday ? " is-on" : ""}`} onClick={() => setToToday((v) => !v)} />
              </label>
            )}
            {top?.open && (
              <button type="button" className="button button--secondary button--sm" onClick={() => api.openToolItem(top.open)}>
                <SourceIcon source={top.source} size={12} /> {top.open.kind === "url" ? t("Open in {name}", { name: sourceName(top.open.source === "frame" ? "figma" : top.open.source) }) : t(OPEN_LABEL[top.open.kind] ?? "Open file")}
              </button>
            )}
          </div>
        </div>
        <footer className="shape__foot">
          <button type="button" className="text-button" onClick={() => api.requestFirstStep(todo.id, { again: true })}>
            <RefreshIcon size={12} /> {t("Reshape")}
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              // 첫 행동에 실제로 쓴 자료를 할 일에 붙여 두면, 목록에서 바로 열 수 있다.
              const used = new Set(state.sources.map((s) => s.source));
              const notes = found
                .filter((r) => used.has(r.source) && r.item)
                .map((r) => toNote(r.item!, (id) => data.shortcuts.find((s) => s.id === id)?.url));
              if (notes.length) api.act({ type: "attach", id: todo.id, notes });
              api.acceptFirstStep(todo.id, { toToday: todo.plannedDate !== today && toToday });
              onClose();
            }}
          >
            {t("Use this step")}
          </button>
        </footer>
      </div>
    );
  }

  // C1: 고르기
  return (
    <div className="shape">
      {header(t("Shape with your tools"))}
      <div className="shape__body">
        <section className="shape__section">
          <h2 className="eyebrow">{t("01 · Your words")}</h2>
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
            {words.length === 0 && <p className="shape__empty">{t("No words to pick — Claude will use the title.")}</p>}
          </div>
        </section>

        <section className="shape__section">
          <div className="shape__label-row">
            <h2 className="eyebrow">{t("02 · Your tools")}</h2>
            {tools && tools.length > 0 && (
              <span className="eyebrow">
                {t("{n} of {total} on", { n: selected.length, total: tools.length })}
              </span>
            )}
          </div>
          {tools === null ? (
            <p className="shape__empty">
              <RigelLoader size={20} /> {t("Reading your tools…")}
            </p>
          ) : tools.length === 0 ? (
            <p className="shape__empty">
              {t("No tools on.")}{" "}
              <button type="button" className="link" onClick={() => api.openSettings("tools")}>
                {t("Choose in Settings")}
              </button>
            </p>
          ) : (
            <div className="tools stagger">
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
                      <span className="tool__name">{sourceName(r.source)}</span>
                      <span className={`toggle toggle--sm${on ? " is-on" : ""}`} />
                    </span>
                    <span className="tool__item motion-fade" key={r.status + (r.item?.label ?? "")}>
                      {loading && <Spinner size={10} />}{" "}
                      {r.item?.label ?? (r.source === "figma" && r.status === "empty" && data.shortcuts.length === 0 ? t("No shortcuts yet") : t(TOOL_DESC[r.status] ?? ""))}
                    </span>
                    {isMcp(r.source) ? (
                      <span className="badge badge--mcp" title={t("Workspace Claude Code reads")}>
                        MCP · {data.settings.tools.mcpInfo[r.source]?.workspace ?? t("read only")}
                      </span>
                    ) : (
                      <span className="badge">{t("Local")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {found.some((r) => r.item?.text || r.item?.preview) && (
            <div className="found motion-rise" style={{ "--i": 2 } as React.CSSProperties}>
              <span className="eyebrow">{t("What we found · tap to check")}</span>
              {found
                .filter((r) => r.item?.text || r.item?.preview)
                .map((r) => (
                  <Evidence key={r.source} source={r.source} label={r.item!.label} item={r.item!} words={onWords} />
                ))}
            </div>
          )}
        </section>

        <section className="shape__section">
          <div className="shape__label-row">
            <h2 className="eyebrow">{t("03 · How big?")}</h2>
            {dial.daysLeft !== null && minutes === null && (
              <span className="eyebrow">
                {deadlineFrom} · {dial.daysLeft === 0 ? t("today") : dial.daysLeft === 1 ? t("1 day left") : t("{n} days left", { n: dial.daysLeft })}
              </span>
            )}
          </div>
          <SizeDial value={size} onChange={setMinutes} />
        </section>

        {selected.length > 0 && (
          <section className="shape__section">
            <div className="shape__label-row">
              <h2 className="eyebrow">{t("04 · Mix by source")}</h2>
              <span className="eyebrow">{t("Drag edges")}</span>
            </div>
            <MixBar mix={currentMix} onChange={setMix} />
          </section>
        )}

        {state && state.status !== "loading" && <FirstStepCard state={state} originalTitle={todo.title} />}
        {/* 만드는 중: 실제로 읽는 도구의 색이 빛에 섞이고, 무엇을 보냈는지·지금 무엇을 하는지만 보여 준다 */}
        {(state?.status === "loading" || waitingSince !== null) && (
          <div className="shape-progress motion-rise">
            <span className="hero-glow" aria-hidden="true">
              {sourceColors(waitingSince !== null ? waiting.map((r) => r.source) : (state?.shape?.context ?? []).map((c) => c.source)).map((c, i, all) => (
                <span key={c} className="hero-glow__src" style={{ "--src": c, "--i": i, "--n": all.length } as React.CSSProperties} />
              ))}
            </span>
            {waitingSince !== null ? (
              <div className="fs-progress" role="status">
                {found.filter((r) => selected.includes(r.source)).length > 0 && (
                  <p className="fs-progress__row is-done">
                    <CheckIcon size={11} /> {t("Found in {names}", { names: [...new Set(found.filter((r) => selected.includes(r.source)).map((r) => sourceName(r.source)))].join(", ") })}
                  </p>
                )}
                <p className="fs-progress__row">
                  <RigelLoader size={20} /> {t("Reading {names}…", { names: waiting.map((r) => sourceName(r.source)).join(", ") })}
                </p>
              </div>
            ) : (
              state && <FirstStepProgress state={state} />
            )}
          </div>
        )}
      </div>
      <footer className="shape__foot">
        {waitingSince !== null && now - waitingSince > SKIP_AFTER_MS ? (
          <button type="button" className="text-button" onClick={skipWaiting}>
            {t("Skip {names}", { names: waiting.map((r) => sourceName(r.source)).join(", ") })}
          </button>
        ) : (
          <span className="shape__note">
            {mcpOn.length ? t("MCP reads via Claude Code") : t("Sends titles only")} · {sizeLabel(size, currentLang())}
          </span>
        )}
        <span className="spacer" />
        <button type="button" className="button button--primary" disabled={busy || tools === null} onClick={shapeIt}>
          {busy ? <Spinner size={12} /> : <AiSparkle size={12} />}{" "}
          {waitingSince !== null ? t("Waiting for {names}", { names: waiting.map((r) => sourceName(r.source)).join(", ") }) : busy ? t("Shaping…") : t("Shape it")}
        </button>
      </footer>
    </div>
  );
}
