import { msg } from "@shared/i18n";
import { useEffect, useState } from "react";
import type { FirstStepState } from "@shared/firstStep";
import { RigelIcon } from "./components/icons";
import { RigelLoader } from "./components/RigelLoader";
import { t } from "./i18n";
import { CheckIcon } from "./components/icons";
import { sourceName } from "./components/SourceIcon";
import { limitReset } from "@shared/claude";
import { resetTime } from "./claudeLabels";

const api = window.todoban;

const ERROR_TEXT: Record<string, string> = {
  timeout: msg("Claude didn't respond."),
  notLoggedIn: msg("Sign in to Claude Code first — run claude in Terminal."),
  notFound: msg("Claude Code isn't installed."),
  usageLimit: msg("You've reached your Claude usage limit. Try again a little later."),
  network: msg("Couldn't reach Claude. Check your internet connection."),
  outdated: msg("Your Claude Code is too old for Rigel. Run claude update in a terminal."),
  parseFailed: msg("Couldn't read Claude's answer."),
  failed: msg("Couldn't get a first step."),
};

// 기다리는 동안 실제로 일어나는 일만 보여 준다(꾸민 단계를 만들지 않는다).
// 1) 무엇을 보냈는지(할 일·답·낱말·자료) 2) 지금 고르는 중 · 최근 기록으로 본 “보통 몇 초”
export function FirstStepProgress({ state }: { state: FirstStepState }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const shape = state.shape;
  const names = [...new Set((shape?.context ?? []).map((c) => sourceName(c.source)))].join(", ");
  const sent = shape
    ? names
      ? t("Sent {n} words and your {names} notes", { n: shape.words.length, names })
      : t("Sent {n} words", { n: shape.words.length })
    : state.answer
      ? t("Sent your answer too")
      : t("Sent the task");
  const elapsed = state.startedAt ? (now - state.startedAt) / 1000 : 0;
  const expect = state.expectMs ? Math.max(1, Math.round(state.expectMs / 1000)) : null;
  const meta = expect === null ? null : elapsed > expect * 1.6 + 3 ? t("Taking longer than usual") : t("Usually {s}s", { s: expect });
  return (
    <div className="fs-progress motion-fade" role="status">
      <p className="fs-progress__row is-done">
        <CheckIcon size={11} /> {sent}
      </p>
      <p className="fs-progress__row">
        <RigelLoader size={16} /> {state.answer && !shape ? t("Shaping a step from your answer…") : t("Finding a first step…")}
        {meta && <span className="fs-progress__meta">{meta}</span>}
      </p>
    </div>
  );
}

// 정리 안 된 할 일 아래에 펼쳐지는 카드: 찾는 중(A3) · 제안(A4) · 질문(A5) · 오류
export function FirstStepCard({ state, originalTitle }: { state: FirstStepState; originalTitle: string }) {
  const [answer, setAnswer] = useState(state.answer ?? "");
  const id = state.todoId;
  // 카드 안의 클릭이 끌기나 행 선택으로 번지지 않게 막는다.
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

  if (state.status === "loading") {
    return (
      <div {...stop}>
        <FirstStepProgress state={state} />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="fs-card fs-card--plain motion-rise" {...stop}>
        <p className="fs-card__body">
          {state.error?.kind === "usageLimit" && limitReset(state.error.message)
            ? t("You've reached your Claude usage limit. You can try again after {time}.", { time: resetTime(limitReset(state.error.message)!) })
            : t(ERROR_TEXT[state.error?.kind ?? "failed"] ?? ERROR_TEXT.failed!)}
        </p>
        <div className="fs-card__actions">
          <button type="button" className="button button--primary button--sm" onClick={() => api.requestFirstStep(id, { answer: state.answer ?? undefined })}>
            {t("Try again")}
          </button>
          <span className="spacer" />
          <button type="button" className="text-button" onClick={() => api.dismissFirstStep(id)}>
            {t("Close")}
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "question") {
    const send = () => answer.trim() && api.requestFirstStep(id, { answer });
    return (
      <div className="fs-card fs-card--hero motion-rise" {...stop}>
        <p className="fs-card__eyebrow">{t("One question")}</p>
        <p className="fs-card__title">{state.question}</p>
        <input
          className="fs-card__input"
          autoFocus
          value={answer}
          placeholder={t("Type an answer, then Enter")}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") send();
            if (e.key === "Escape") api.dismissFirstStep(id);
          }}
        />
        <p className="fs-card__hint">{t("ENTER ANSWER · ESC KEEP AS IS")}</p>
      </div>
    );
  }

  return (
    <div className="fs-card fs-card--hero motion-rise" {...stop}>
      <p className="fs-card__eyebrow fs-card__eyebrow--ai">
        <RigelIcon size={13} className="rigel-lit" /> {t("First step")}
      </p>
      <p className="fs-card__title">{state.title}</p>
      <p className="fs-card__body">{t("Instead of “{title}”", { title: originalTitle })}</p>
      <div className="fs-card__actions">
        <button type="button" className="button button--primary button--sm" onClick={() => api.acceptFirstStep(id)}>
          {t("Use this step")}
        </button>
        <button type="button" className="text-button" onClick={() => api.requestFirstStep(id, { again: true })}>
          {t("Reshape")}
        </button>
        <span className="spacer" />
        <button type="button" className="text-button" onClick={() => api.dismissFirstStep(id)}>
          {t("Keep as is")}
        </button>
      </div>
    </div>
  );
}
