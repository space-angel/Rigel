#!/bin/sh
# 시나리오용 가짜 claude: Notion은 인증 필요, Linear는 연결됐지만 읽으면 실패, Figma는 Claude에 없음.
case "$1" in
  --version) echo "2.1.304 (Claude Code)"; exit 0 ;;
  mcp) printf 'Checking MCP server health…\n\nclaude.ai Notion: https://mcp.notion.com/mcp - ✔ Connected\nclaude.ai Linear: https://mcp.linear.app/mcp - ✔ Connected\n'; exit 0 ;;
esac
cat > /dev/null
echo '{"type":"system","subtype":"init","mcp_servers":[{"name":"claude.ai Notion","status":"needs-auth"},{"name":"claude.ai Linear","status":"connected"}],"tools":[]}'
sleep 1
echo '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"tool call failed"}'
