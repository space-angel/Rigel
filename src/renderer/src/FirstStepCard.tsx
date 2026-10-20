import { useState } from "react";
import type { FirstStepState } from "@shared/firstStep";
import { AiSparkle, Spinner } from "./components/icons";

const api = window.todoban;

const ERROR_TEXT: Record<string, string> = {
  timeout: "Claude가 응답하지 않아요",
  notLoggedIn: "Claude Code 로그인이 필요해요. 터미널에서 claude를 실행해 주세요",
  notFound: "Claude Code를 찾지 못했어요",
  parseFailed: "제안을 읽지 못했어요",
  failed: "첫 행동을 받지 못했어요",
};

// 정리 안 된 할 일 아래에 펼쳐지는 카드: 찾는 중(A3) · 제안(A4) · 질문(A5) · 오류
export function FirstStepCard({ state, originalTitle }: { state: FirstStepState; originalTitle: string }) {
  const [answer, setAnswer] = useState(state.answer ?? "");
  const id = state.todoId;
  // 카드 안의 클릭이 끌기나 행 선택으로 번지지 않게 막는다.
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

  if (state.status === "loading") {
    return (
      <div className="fs-status" {...stop}>
        <Spinner size={12} /> {state.answer ? "답을 보고 첫 행동을 고르는 중…" : "첫 행동 찾는 중…"}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="fs-card fs-card--plain" {...stop}>
        <p className="fs-card__body">{ERROR_TEXT[state.error?.kind ?? "failed"]}</p>
        <div className="fs-card__actions">
          <button type="button" className="button button--primary button--sm" onClick={() => api.requestFirstStep(id, { answer: state.answer ?? undefined })}>
            다시 시도
          </button>
          <span className="spacer" />
          <button type="button" className="text-button" onClick={() => api.dismissFirstStep(id)}>
            닫기
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "question") {
    const send = () => answer.trim() && api.requestFirstStep(id, { answer });
    return (
      <div className="fs-card fs-card--plain" {...stop}>
        <p className="fs-card__eyebrow">하나만 물어볼게요</p>
        <p className="fs-card__title">{state.question}</p>
        <input
          className="fs-card__input"
          autoFocus
          value={answer}
          placeholder="답을 적고 Enter"
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") send();
            if (e.key === "Escape") api.dismissFirstStep(id);
          }}
        />
        <p className="fs-card__hint">Enter 답하기 · Esc 그대로 두기</p>
      </div>
    );
  }

  return (
    <div className="fs-card fs-card--mint" {...stop}>
      <p className="fs-card__eyebrow fs-card__eyebrow--ai">
        <AiSparkle size={12} /> 첫 행동으로 바꿀까요?
      </p>
      <p className="fs-card__title">{state.title}</p>
      <p className="fs-card__body">“{originalTitle}” 대신</p>
      <div className="fs-card__actions">
        <button type="button" className="button button--primary button--sm" onClick={() => api.acceptFirstStep(id)}>
          이걸로 바꾸기
        </button>
        <button type="button" className="text-button" onClick={() => api.requestFirstStep(id, { again: true })}>
          다른 제안
        </button>
        <span className="spacer" />
        <button type="button" className="text-button" onClick={() => api.dismissFirstStep(id)}>
          그대로 두기
        </button>
      </div>
    </div>
  );
}
