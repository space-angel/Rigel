import { z } from "zod";

// MCP 도구: Claude Code에 연결된 claude.ai 커넥터를 읽기 전용으로 쓴다 (7-a에서 확인한 설정).
// 서비스마다 여는 도구는 앱에 고정한다. 커넥터에는 세션 시작, 메시지 보내기, 삭제 같은 도구가 섞여 있어서 이름 패턴으로 고르지 않는다.
// search: 자료를 찾는 도구(collect에서 이 중 하나는 꼭 불러야 한다), tools: collect에서 여는 도구 전부,
// whoami: 연결된 워크스페이스와 계정을 알려 주는 도구. 커넥터 하나는 워크스페이스 하나에만 연결된다.
export const MCP_SERVICES = {
  // 노션 검색은 키워드 검색이다(자연어 AI 검색은 Notion AI가 있는 Business 플랜부터). 낱말을 문장으로 이어 붙이지 않는다.
  notion: { name: "Notion", server: "claude.ai Notion", search: ["notion-search"], tools: ["notion-search", "notion-fetch"], whoami: "notion-get-self", hosts: ["notion.so", "notion.site", "notion.com"] },
  // list_issues의 query는 이슈 제목·설명 글자 검색이다.
  linear: { name: "Linear", server: "claude.ai Linear", search: ["list_issues"], tools: ["list_issues", "get_issue"], whoami: "get_workspace", hosts: ["linear.app"] },
  // 할 일에 연결된 피그마 바로가기의 프레임을 읽는다. 레이어 이름만으로 글이 부족하면 디자인 내용을 읽는다. 최근 파일 목록을 주는 도구는 없다.
  frame: { name: "Figma frame", server: "claude.ai Figma", search: ["get_metadata", "get_design_context"], tools: ["get_metadata", "get_design_context"], whoami: "whoami", hosts: ["figma.com"] },
} as const;
export type McpSource = keyof typeof MCP_SERVICES;
export const MCP_SOURCES = Object.keys(MCP_SERVICES) as McpSource[];

export type McpStatus = "connected" | "needs-auth" | "failed" | "pending" | "missing";
// 확인 창에서 서비스별로 자료를 찾는 상태
export type EnrichStatus = "loading" | "done" | "empty" | "failed" | "needs-auth" | "slow";

// mcp__<서버 이름의 영문·숫자 외 문자를 _로>__<도구>
export function toolPrefix(server: string): string {
  return `mcp__${server.replace(/[^A-Za-z0-9]+/g, "_")}__`;
}

export function allowedTools(source: McpSource, kind: "collect" | "whoami" = "collect"): string[] {
  const s = MCP_SERVICES[source];
  const tools: readonly string[] = kind === "whoami" ? [s.whoami] : s.tools;
  return ["ToolSearch", ...tools.map((t) => toolPrefix(s.server) + t)];
}

// collect에서 실제로 찾아봤는지. 검색 도구를 한 번도 안 부르고 "없음"을 내면 믿을 수 없다.
export function searched(source: McpSource, calledTools: string[]): boolean {
  const prefix = toolPrefix(MCP_SERVICES[source].server);
  return calledTools.some((t) => (MCP_SERVICES[source].search as readonly string[]).includes(t.replace(prefix, "")));
}

// `claude mcp list` 한 줄: "claude.ai Notion: https://… - ✔ Connected"
export function parseMcpList(stdout: string): Record<string, McpStatus> {
  const out: Record<string, McpStatus> = {};
  for (const line of stdout.split("\n")) {
    const m = line.match(/^(.+?): .* - (✔|!|✘) (.+)$/);
    if (!m) continue;
    out[m[1]!] = m[2] === "✔" ? "connected" : /auth/i.test(m[3]!) ? "needs-auth" : "failed";
  }
  return out;
}

export function statusOf(all: Record<string, McpStatus>, source: McpSource): McpStatus {
  return all[MCP_SERVICES[source].server] ?? "missing";
}

// 링크는 그 서비스 주소일 때만 연다.
export function safeServiceUrl(source: McpSource, url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return MCP_SERVICES[source].hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) ? u.toString() : null;
  } catch {
    return null;
  }
}

// 피그마 링크에서 파일 키와 노드를 꺼낸다. node-id의 -는 :로 바꾼다.
export function figmaTarget(url: string): { fileKey: string; nodeId: string | null } | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)figma\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/(?:design|file|board)\/([A-Za-z0-9]+)/);
    if (!m) return null;
    const node = u.searchParams.get("node-id");
    return { fileKey: m[1]!, nodeId: node ? node.replace(/-/g, ":") : null };
  } catch {
    return null;
  }
}

export const CollectResult = z.object({
  items: z.array(
    z.object({
      label: z.string().min(1),
      text: z.string().default(""),
      date: z.string().nullable().optional(),
      url: z.string().nullable().optional(),
    }),
  ),
});
export type CollectResult = z.infer<typeof CollectResult>;

export const WhoamiResult = z.object({ workspace: z.string().nullable(), account: z.string().nullable() });
export type WhoamiResult = z.infer<typeof WhoamiResult>;

export function whoamiRequest(source: McpSource): string {
  return JSON.stringify({ type: "whoami", source });
}

export function collectRequest(source: McpSource, words: string[], today: string, target?: { fileKey: string; nodeId: string | null } | null): string {
  return JSON.stringify({ type: "collect", source, words, today, ...(target && { target }) });
}

// 확인 창: 나눈 할 일 여러 개를 서비스마다 한 번의 호출로 찾는다. 할 일마다 따로 부르면 claude가 여러 개 떠서 무겁다.
export interface CollectTask {
  key: string;
  title: string;
  words: string[];
  target?: { fileKey: string; nodeId: string | null } | null;
}

export const CollectManyResult = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      label: z.string().min(1),
      text: z.string().default(""),
      date: z.string().nullable().optional(),
      url: z.string().nullable().optional(),
    }),
  ),
});
export type CollectManyResult = z.infer<typeof CollectManyResult>;

export function collectManyRequest(source: McpSource, tasks: CollectTask[], today: string): string {
  return JSON.stringify({ type: "collectMany", source, today, tasks: tasks.map((t) => ({ key: t.key, title: t.title, words: t.words, ...(t.target && { target: t.target }) })) });
}

// 생각에 서비스 이름이 나오는지. 켜 두지 않은 서비스를 언급하면 켜라고 알려 준다.
const MENTIONS: Record<McpSource, RegExp> = {
  notion: /노션|notion/i,
  linear: /리니어|linear/i,
  frame: /피그마|figma/i,
};
export function mentionedServices(text: string): McpSource[] {
  return MCP_SOURCES.filter((s) => MENTIONS[s].test(text));
}
