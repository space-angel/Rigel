import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReviewDraft, ReviewState } from "@shared/review";
import type { Shortcut } from "@shared/types";
import { localDate } from "@shared/todos";
import { AiSparkle, ChevronDownIcon, CloseIcon, PlusIcon, RefreshIcon, Spinner, TerminalIcon, WarningIcon } from "./components/icons";

const api = window.todoban;
const SLOW_AFTER_MS = 10_000;

function dayLabel(date: string | null, today: string): string {
  if (date === null) return "나중";
  if (date <= today) return "오늘";
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
          placeholder="할 일 제목"
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <button type="button" className="draft__remove" aria-label="빼기" onClick={onRemove}>
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
              <option value="">바로가기 없음</option>
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
          title="눌러서 정리 여부를 바꿔요"
          onClick={() => onChange({ isClear: !draft.isClear })}
        >
          {draft.isClear ? "정리됨" : "정리 필요"}
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
      <div className="review__titlebar">할 일 확인</div>
      <div className="review__body">
        <button type="button" className={`raw${rawOpen ? " is-open" : ""}`} onClick={() => setRawOpen((v) => !v)}>
          <span className="raw__label">적은 내용</span>
          <span className="raw__text">{state.rawText}</span>
          <span className="raw__more">{rawOpen ? "접기" : "펼치기"}</span>
          <ChevronDownIcon size={12} />
        </button>

        {state.status === "loading" && (
          <>
            <div className="loading">
              <Spinner size={16} />
              <span>{slow ? "조금 오래 걸리고 있어요" : "Claude가 할 일로 나누는 중…"}</span>
            </div>
            {[0.8, 0.6, 0.7].map((w, i) => (
              <div className="skeleton" key={i}>
                <span style={{ width: `${w * 100}%` }} />
                <span />
              </div>
            ))}
          </>
        )}

        {state.status === "error" && err?.kind === "timeout" && (
          <Notice title="Claude가 응답하지 않아요">
            <p>적은 내용은 그대로 있어요. 다시 시도하거나, 나누지 않고 정리 안 된 할 일 하나로 넣을 수 있어요.</p>
          </Notice>
        )}
        {state.status === "error" && err?.kind === "notLoggedIn" && (
          <>
            <Notice title="Claude Code 로그인이 필요해요">
              <p>터미널에서 claude를 실행해 구독 계정으로 로그인한 뒤 다시 시도해 주세요.</p>
            </Notice>
            <div className="code">$ claude</div>
          </>
        )}
        {state.status === "error" && err?.kind === "notFound" && (
          <Notice title="Claude Code를 찾지 못했어요">
            <p>적은 내용은 그대로 있어요. Claude Code를 설치하거나 설정에서 경로를 지정한 뒤 다시 시도해 주세요.</p>
          </Notice>
        )}
        {state.status === "error" && err?.kind === "failed" && (
          <Notice title="Claude가 할 일을 나누지 못했어요">
            <p>적은 내용은 그대로 있어요. 다시 시도하거나 나누지 않고 넣을 수 있어요.</p>
            {err.message && <p className="notice__detail">{err.message}</p>}
          </Notice>
        )}

        {state.status === "ready" && (
          <>
            {err?.kind === "parseFailed" ? (
              <Notice title="할 일로 나누지 못했어요">
                <p>적은 내용을 그대로 넣을게요. 제목을 고치거나, 넣은 뒤 목록에서 첫 행동을 받을 수 있어요.</p>
              </Notice>
            ) : (
              <h2 className="review__heading">
                <AiSparkle size={14} /> 할 일 {drafts.length}개로 나눴어요
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
            <PlusIcon size={14} /> 할 일 추가
          </button>
        )}
        {state.status === "ready" && err?.kind === "parseFailed" && (
          <button type="button" className="button button--ghost" onClick={api.retryReview}>
            <RefreshIcon size={14} /> 다시 나누기
          </button>
        )}
        {state.status === "error" && err?.kind === "notLoggedIn" && (
          <button type="button" className="button button--ghost" onClick={api.openTerminal}>
            <TerminalIcon size={14} /> 터미널 열기
          </button>
        )}
        <span className="spacer" />
        {state.status === "ready" ? (
          <>
            <button type="button" className="button button--secondary" onClick={api.cancelReview}>
              취소
            </button>
            <button type="button" className="button button--primary" disabled={!valid.length} onClick={commit}>
              {valid.length}개 넣기
            </button>
          </>
        ) : state.status === "error" ? (
          <>
            <button type="button" className="button button--secondary" onClick={api.insertRawReview}>
              나누지 않고 넣기
            </button>
            <button type="button" className="button button--primary" onClick={api.retryReview}>
              <RefreshIcon size={14} /> 다시 시도
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button button--secondary" onClick={api.cancelReview}>
              취소
            </button>
            <button type="button" className="button button--primary" disabled>
              넣기
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
