import type { ClaudeErrorKind } from "./claude.ts";

// 확인 창에서 고치는 할 일 한 개
export interface ReviewDraft {
  key: string;
  title: string;
  plannedDate: string | null;
  isClear: boolean;
  shortcutId: string | null;
}

export interface ReviewState {
  sessionId: string;
  rawText: string;
  status: "loading" | "ready" | "error";
  startedAt: number;
  drafts: ReviewDraft[];
  // ready인데 error가 있으면 나누지 못해 원문 첫 줄로 한 할 일을 만든 경우(parseFailed)다.
  error: { kind: ClaudeErrorKind; message: string } | null;
}
