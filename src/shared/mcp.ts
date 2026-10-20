import { z } from "zod";

// MCP 도구: Claude Code에 연결된 claude.ai 커넥터를 읽기 전용으로 쓴다 (7-a에서 확인한 설정).
// 서비스마다 여는 도구는 앱에 고정한다. 커넥터에는 세션 시작, 메시지 보내기, 삭제 같은 도구가 섞여 있어서 이름 패턴으로 고르지 않는다.
export const MCP_SERVICES = {
  notion: { name: "Notion", server: "claude.ai Notion", tools: ["notion-search", "notion-fetch"], hosts: ["notion.so", "notion.site"] },
  linear: { name: "Linear", server: "claude.ai Linear", tools: ["list_issues", "get_issue"], hosts: ["linear.app"] },
  // 할 일에 연결된 피그마 바로가기의 프레임을 읽는다. 최근 파일 목록을 주는 도구는 없다.
  frame: { name: "Figma frame", server: "claude.ai Figma", tools: ["get_metadata"], hosts: ["figma.com"] },
} as const;
export type McpSource = keyof typeof MCP_SERVICES;
export const MCP_SOURCES = Object.keys(MCP_SERVICES) as McpSource[];

export type McpStatus = "connected" | "needs-auth" | "failed" | "pending" | "missing";

// mcp__<서버 이름의 영문·숫자 외 문자를 _로>__<도구>
export function toolPrefix(server: string): string {
  return `mcp__${server.replace(/[^A-Za-z0-9]+/g, "_")}__`;
}

export function allowedTools(source: McpSource): string[] {
  const s = MCP_SERVICES[source];
  return ["ToolSearch", ...s.tools.map((t) => toolPrefix(s.server) + t)];
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

export function collectRequest(source: McpSource, words: string[], today: string, target?: { fileKey: string; nodeId: string | null } | null): string {
  return JSON.stringify({ type: "collect", source, words, today, ...(target && { target }) });
}
