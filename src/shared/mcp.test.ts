import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedTools, figmaTarget, parseMcpList, safeServiceUrl, searched, statusOf } from "./mcp.ts";

test("claude mcp list 출력에서 서버 상태를 읽는다", () => {
  const out = [
    "Checking MCP server health…",
    "",
    "claude.ai Notion: https://mcp.notion.com/mcp - ✔ Connected",
    "claude.ai Gmail: https://gmailmcp.googleapis.com/mcp/v1 - ! Needs authentication",
    "haribo: https://example.run.app/mcp (HTTP) - ✘ Failed to connect — HTTP 503",
  ].join("\n");
  const all = parseMcpList(out);
  assert.equal(all["claude.ai Notion"], "connected");
  assert.equal(all["claude.ai Gmail"], "needs-auth");
  assert.equal(all["haribo"], "failed");
  assert.equal(statusOf(all, "notion"), "connected");
  assert.equal(statusOf(all, "linear"), "missing");
});

test("서비스별 읽기 도구만 연다", () => {
  assert.deepEqual(allowedTools("notion"), ["ToolSearch", "mcp__claude_ai_Notion__notion-search", "mcp__claude_ai_Notion__notion-fetch"]);
  assert.ok(allowedTools("frame").every((t) => t === "ToolSearch" || t.startsWith("mcp__claude_ai_Figma__get_")));
});

test("링크는 그 서비스의 https 주소만 연다", () => {
  assert.equal(safeServiceUrl("notion", "https://www.notion.so/abc"), "https://www.notion.so/abc");
  assert.equal(safeServiceUrl("notion", "https://evil.com/notion.so"), null);
  assert.equal(safeServiceUrl("linear", "http://linear.app/x"), null);
  assert.equal(safeServiceUrl("linear", "file:///etc/passwd"), null);
  assert.equal(safeServiceUrl("notion", null), null);
});

test("피그마 링크에서 파일 키와 노드를 꺼낸다", () => {
  assert.deepEqual(figmaTarget("https://www.figma.com/design/uLkr123/todoBAN?node-id=65-272"), { fileKey: "uLkr123", nodeId: "65:272" });
  assert.deepEqual(figmaTarget("https://www.figma.com/file/AbC/x"), { fileKey: "AbC", nodeId: null });
  assert.equal(figmaTarget("https://example.com/design/x"), null);
});

test("워크스페이스 확인은 whoami 도구 하나만 연다", () => {
  assert.deepEqual(allowedTools("notion", "whoami"), ["ToolSearch", "mcp__claude_ai_Notion__notion-get-self"]);
  assert.deepEqual(allowedTools("linear", "whoami"), ["ToolSearch", "mcp__claude_ai_Linear__get_workspace"]);
});

test("검색 도구를 불렀는지 본다 (ToolSearch나 fetch만으로는 아님)", () => {
  assert.equal(searched("notion", ["ToolSearch", "mcp__claude_ai_Notion__notion-search"]), true);
  assert.equal(searched("notion", ["ToolSearch", "mcp__claude_ai_Notion__notion-fetch"]), false);
  assert.equal(searched("linear", []), false);
  assert.equal(searched("frame", ["mcp__claude_ai_Figma__get_design_context"]), true);
});
