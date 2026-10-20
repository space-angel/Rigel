import type { ClaudeErrorKind, FirstStepSource } from "./claude.ts";
import type { ShapeInput } from "./shape.ts";

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
  // 빚기(C1)로 요청했을 때: 보낸 낱말·크기·자료와, Claude가 실제로 참고했다고 한 출처
  shape: ShapeInput | null;
  minutes: number | null;
  sources: FirstStepSource[];
  // 미리 찾기: 사용자가 묻기 전에 뒤에서 찾아 둔 것. 물어보면 그때 보인다(hidden → false).
  hidden?: boolean;
  forTitle?: string; // 찾을 때의 제목. 제목이 바뀌면 버린다
  startedAt?: number;
  expectMs?: number | null; // 최근 몇 번 걸린 시간의 가운데 값(“보통 7초”)
}
