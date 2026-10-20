import type { ClaudeErrorKind } from "./claude.ts";

// 정리 안 된 할 일 하나에 대한 첫 행동 요청 상태. 목록 창이 닫혀도 유지되도록 메인 프로세스가 들고 있다.
export interface FirstStepState {
  todoId: string;
  status: "loading" | "suggestion" | "question" | "error";
  title: string | null; // 제안한 첫 행동
  shortcutId: string | null;
  question: string | null;
  answer: string | null; // 질문에 대한 사용자 답
  previous: string[];
  error: { kind: ClaudeErrorKind; message: string } | null;
}
