#!/bin/sh
# 시나리오용 가짜 claude: 첫 행동 요청에 FAKE_DELAY초(기본 3) 뒤 답한다. 부를 때마다 FAKE_LOG에 한 줄 남긴다.
case "$1" in
  --version) echo "2.1.304 (Claude Code)"; exit 0 ;;
  mcp) printf 'No MCP servers configured.\n'; exit 0 ;;
esac
cat > /dev/null
[ -n "$FAKE_LOG" ] && echo "call $(date +%s)" >> "$FAKE_LOG"
sleep "${FAKE_DELAY:-3}"
echo '{"type":"result","subtype":"success","is_error":false,"result":"{\"title\":\"면접 예상 질문 3개만 적어 보기\",\"question\":null,\"shortcut\":null}"}'
