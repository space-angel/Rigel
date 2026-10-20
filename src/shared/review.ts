import type { ClaudeErrorKind } from "./claude.ts";
import type { EnrichStatus, McpSource } from "./mcp.ts";
import type { ContextNote } from "./types.ts";

// 확인 창에서 고치는 할 일 한 개
export interface ReviewDraft {
  key: string;
  title: string;
  plannedDate: string | null;
  dueDate?: string | null; // 마감·행사 날
  isClear: boolean;
  shortcutId: string | null;
  context?: ContextNote[]; // 넣을 때 할 일에 붙일 자료
}

export interface ReviewState {
  sessionId: string;
  rawText: string;
  status: "loading" | "ready" | "error";
  startedAt: number;
  drafts: ReviewDraft[];
  // ready인데 error가 있으면 나누지 못해 원문 첫 줄로 한 할 일을 만든 경우(parseFailed)다.
  error: { kind: ClaudeErrorKind; message: string } | null;
  // 나눈 뒤 켜 둔 MCP 도구로 할 일마다 자료를 찾는다. 확인 창은 기다리지 않고, 찾는 대로 칩을 채운다.
  context: Record<string, ContextNote[]>; // draft key → 자료
  enrich: Partial<Record<McpSource, EnrichStatus>>;
  mentions: McpSource[]; // 생각에 나왔지만 꺼 둔 서비스
}
