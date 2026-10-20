import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReviewDraft, ReviewState } from "@shared/review";
import type { Shortcut } from "@shared/types";
import { localDate } from "@shared/todos";
import { AiSparkle, ChevronDownIcon, CloseIcon, PlusIcon, RefreshIcon, TerminalIcon, WarningIcon } from "./components/icons";

const api = window.todoban;
const SLOW_AFTER_MS = 10_000;

function dayLabel(date: string | null, today: string): string {
  if (date === null) return "Later";
  if (date <= today) return "Today";
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function DraftRow({
  draft,
  shortcuts,
  onChange,
  onRemove,
}: {
  draft: ReviewDraft;
  shortcuts: Shortcut[];
  onChange: (patch: Partial<ReviewDraft>) => void;
  onRemove: () => void;
}) {
  const today = localDate();
  const [originalDate] = useState(draft.plannedDate);
  // 오늘 → 나중 → (AI가 정한 미래 날짜가 있으면 그 날짜) 순서로 바꾼다.
  const cycleDay = () => {
    const options = [today, null, ...(originalDate && originalDate > today ? [originalDate] : [])];
    const i = options.findIndex((o) => (o === null ? draft.plannedDate === null : draft.plannedDate !== null && dayLabel(o, today) === dayLabel(draft.plannedDate, today)));
    onChange({ plannedDate: options[(i + 1) % options.length] ?? today });
  };
  return (
    <div className={`draft${draft.isClear ? "" : " is-unclear"}`}>
      <div className="draft__top">
        <input
          className="draft__title"
          value={draft.title}
          placeholder="Task title"
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <button type="button" className="draft__remove" aria-label="Remove" onClick={onRemove}>
          <CloseIcon size={14} />
        </button>
      </div>
      <div className="draft__meta">
        <button type="button" className="pill" onClick={cycleDay}>
          {dayLabel(draft.plannedDate, today)} <ChevronDownIcon size={12} />
        </button>
        {shortcuts.length > 0 && (
          <label className="pill pill--select">
            ▶︎{" "}
            <select value={draft.shortcutId ?? ""} onChange={(e) => onChange({ shortcutId: e.target.value || null })}>
              <option value="">No shortcut</option>
              {shortcuts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={12} />
          </label>
        )}
        <button
          type="button"
          className={`chip chip--toggle${draft.isClear ? " is-off" : ""}`}
          title="Toggle whether this needs a first step"
          onClick={() => onChange({ isClear: !draft.isClear })}
        >
          {draft.isClear ? "Clear" : "Unclear"}
        </button>
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="notice">
      <WarningIcon size={16} />
      <div className="notice__body">
        <p className="notice__title">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function Review() {
  const [state, setState] = useState<ReviewState | null>(null);
  const [drafts, setDrafts] = useState<ReviewDraft[]>([]);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [rawOpen, setRawOpen] = useState(false);
  const [slow, setSlow] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getReview().then((s) => s && setState(s));
    api.getData().then((d) => setShortcuts(d.shortcuts));
    const offData = api.onData((d) => setShortcuts(d.shortcuts));
    const offReview = api.onReview(setState);
    return () => {
      offData();
      offReview();
    };
  }, []);

  // 새 결과가 오면 고칠 수 있는 사본을 만든다.
  useEffect(() => {
    setDrafts(state?.drafts ?? []);
    setRawOpen(false);
  }, [state?.sessionId, state?.status, state?.drafts]);

  useEffect(() => {
    setSlow(false);
    if (state?.status !== "loading") return;
    const t = setTimeout(() => setSlow(true), Math.max(0, SLOW_AFTER_MS - (Date.now() - state.startedAt)));
    return () => clearTimeout(t);
  }, [state?.status, state?.startedAt]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => api.resizeReview(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [state !== null]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") api.cancelReview();
      if (e.key === "Enter" && e.metaKey && state?.status === "ready") commit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!state) return <div ref={rootRef} className="review" />;

  const valid = drafts.filter((d) => d.title.trim());
  const commit = () => valid.length && api.commitReview(valid);
  const update = (key: string, patch: Partial<ReviewDraft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const addDraft = () =>
    setDrafts((ds) => [...ds, { key: crypto.randomUUID(), title: "", plannedDate: localDate(), isClear: false, shortcutId: null }]);
  const err = state.error;

  return (
    <div className="review" ref={rootRef}>
      <div className="review__titlebar">Review</div>
      <div className="review__body">
        <button type="button" className={`raw${rawOpen ? " is-open" : ""}`} onClick={() => setRawOpen((v) => !v)}>
          <span className="raw__label">Your thought</span>
          <span className="raw__text">{state.rawText}</span>
          <span className="raw__more">{rawOpen ? "Collapse" : "Expand"}</span>
          <ChevronDownIcon size={12} />
        </button>

        {state.status === "loading" && (
          // B2: 나누는 동안 할 일 카드가 될 빈 글래스 카드들이 흩어져 떠 있다.
          <div className="splitting">
            <div className="splitting__pill">
              <AiSparkle size={12} /> {slow ? "Taking a little longer…" : "Splitting into tasks…"}
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div className={`ghost ghost--${i}`} key={i} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        )}

        {state.status === "error" && err?.kind === "timeout" && (
          <Notice title="Claude didn't respond">
            <p>Your thought is safe. Try again, or add it as one unclear task without splitting.</p>
          </Notice>
        )}
        {state.status === "error" && err?.kind === "notLoggedIn" && (
          <>
            <Notice title="Sign in to Claude Code">
              <p>Run claude in Terminal, sign in with your subscription, then try again.</p>
            </Notice>
            <div className="code">$ claude</div>
          </>
        )}
        {state.status === "error" && err?.kind === "notFound" && (
          <Notice title="Claude Code isn't installed">
            <p>Your thought is safe. Install Claude Code or set its path in Settings, then try again.</p>
          </Notice>
        )}
        {state.status === "error" && err?.kind === "failed" && (
          <Notice title="Claude couldn't split this">
            <p>Your thought is safe. Try again, or add it without splitting.</p>
            {err.message && <p className="notice__detail">{err.message}</p>}
          </Notice>
        )}

        {state.status === "ready" && (
          <>
            {err?.kind === "parseFailed" ? (
              <Notice title="Couldn't split into tasks">
                <p>It'll go in as written. Edit the title, or shape a first step from the list later.</p>
              </Notice>
            ) : (
              <h2 className="review__heading">
                <AiSparkle size={14} /> {drafts.length} {drafts.length === 1 ? "task" : "tasks"} from your thought
              </h2>
            )}
            <div className="drafts">
              {drafts.map((d) => (
                <DraftRow
                  key={d.key}
                  draft={d}
                  shortcuts={shortcuts}
                  onChange={(p) => update(d.key, p)}
                  onRemove={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="review__footer">
        {state.status === "ready" && (
          <button type="button" className="button button--ghost" onClick={addDraft}>
            <PlusIcon size={14} /> Add task
          </button>
        )}
        {state.status === "ready" && err?.kind === "parseFailed" && (
          <button type="button" className="button button--ghost" onClick={() => api.retryReview()}>
            <RefreshIcon size={14} /> Split again
          </button>
        )}
        {state.status === "error" && err?.kind === "notLoggedIn" && (
          <button type="button" className="button button--ghost" onClick={() => api.openTerminal()}>
            <TerminalIcon size={14} /> Open Terminal
          </button>
        )}
        <span className="spacer" />
        {state.status === "ready" ? (
          <>
            <button type="button" className="button button--secondary" onClick={() => api.cancelReview()}>
              Cancel
            </button>
            <button type="button" className="button button--primary" disabled={!valid.length} onClick={commit}>
              Add {valid.length} {valid.length === 1 ? "task" : "tasks"}
            </button>
          </>
        ) : state.status === "error" ? (
          <>
            <button type="button" className="button button--secondary" onClick={() => api.insertRawReview()}>
              Add without splitting
            </button>
            <button type="button" className="button button--primary" onClick={() => api.retryReview()}>
              <RefreshIcon size={14} /> Try again
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button button--secondary" onClick={() => api.cancelReview()}>
              Cancel
            </button>
            <button type="button" className="button button--primary" disabled>
              Add
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
