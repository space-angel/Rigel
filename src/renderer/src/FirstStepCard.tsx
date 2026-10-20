import { msg } from "@shared/i18n";
import { useState } from "react";
import type { FirstStepState } from "@shared/firstStep";
import { AiSparkle, Spinner } from "./components/icons";
import { t } from "./i18n";

const api = window.todoban;

const ERROR_TEXT: Record<string, string> = {
  timeout: msg("Claude didn't respond."),
  notLoggedIn: msg("Sign in to Claude Code first — run claude in Terminal."),
  notFound: msg("Claude Code isn't installed."),
  parseFailed: msg("Couldn't read Claude's answer."),
  failed: msg("Couldn't get a first step."),
};

// 정리 안 된 할 일 아래에 펼쳐지는 카드: 찾는 중(A3) · 제안(A4) · 질문(A5) · 오류
export function FirstStepCard({ state, originalTitle }: { state: FirstStepState; originalTitle: string }) {
  const [answer, setAnswer] = useState(state.answer ?? "");
  const id = state.todoId;
  // 카드 안의 클릭이 끌기나 행 선택으로 번지지 않게 막는다.
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

  if (state.status === "loading") {
    return (
      <div className="fs-status motion-fade" {...stop}>
        <Spinner size={12} /> {state.answer ? t("Shaping a step from your answer…") : t("Finding a first step…")}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="fs-card fs-card--plain motion-rise" {...stop}>
        <p className="fs-card__body">{t(ERROR_TEXT[state.error?.kind ?? "failed"] ?? ERROR_TEXT.failed!)}</p>
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
        <AiSparkle size={12} /> {t("First step")}
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
