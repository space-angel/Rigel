// 시나리오용 가짜 claude (Node). 맥·윈도우 어디서나 같은 동작.
// FAKE_MODE로 다른 사람의 컴퓨터에서 생길 상황을 흉내 낸다. 출력은 실제 claude 2.1.304의 모양을 따른다.
//   ok(기본)   로그인됨(Pro 구독), 첫 행동을 FAKE_DELAY초(기본 3) 뒤 돌려준다
//   logout     로그인 안 됨 (docs/qa/fixtures/claude-outputs/not-logged-in.json과 같은 결과)
//   expired    로그인이 만료됨
//   limit      구독 사용량 한도(“resets 3pm”)
//   offline    인터넷에 닿지 못함(표준 오류에 getaddrinfo ENOTFOUND, 출력 없음)
//   apikey     API 키로 로그인됨
//   old        auth 명령이 없는 옛 claude
//   ancient    앱이 쓰는 옵션을 모르는 아주 옛 claude
// 부를 때마다 FAKE_LOG에 받은 인자를 한 줄 남긴다(윈도우 claude.cmd 실행에서 인자가 안 깨졌는지 확인용).
import { appendFileSync } from "node:fs";

const mode = process.env.FAKE_MODE ?? "ok";
const args = process.argv.slice(2);
const out = (o) => process.stdout.write(JSON.stringify(o));
const result = (isError, text) => ({ type: "result", subtype: "success", is_error: isError, result: text, terminal_reason: isError ? "api_error" : "completed" });

if (args[0] === "--version") {
  console.log("2.1.304 (Claude Code)");
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "status") {
  if (mode === "old" || mode === "ancient") {
    console.error("error: unknown command 'auth'");
    process.exit(1);
  }
  const loggedIn = mode !== "logout" && mode !== "expired";
  out({ loggedIn, authMethod: !loggedIn ? "none" : mode === "apikey" ? "api_key" : "claude.ai", apiProvider: "firstParty", ...(loggedIn && mode !== "apikey" && { subscriptionType: "pro" }) });
  process.exit(0);
}
if (args[0] === "mcp") {
  console.log("No MCP servers configured. Use `claude mcp add` to add a server.");
  process.exit(0);
}
let body = "";
process.stdin.on("data", (d) => (body += d));
process.stdin.on("end", () => {
  if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, JSON.stringify({ mode, args, bytes: body.length }) + "\n");
  if (mode === "ancient") return process.stderr.write("error: unknown option '--setting-sources'\n"), process.exit(1);
  if (mode === "logout") return out(result(true, "Not logged in · Please run /login")), process.exit(1);
  if (mode === "expired") return out(result(true, "OAuth token has expired. Please obtain a new token or refresh your existing token. · Please run /login")), process.exit(1);
  if (mode === "limit") return out(result(true, "5-hour limit reached ∙ resets 3pm")), process.exit(1);
  if (mode === "offline") return process.stderr.write("API Error: getaddrinfo ENOTFOUND api.anthropic.com\n"), process.exit(1);
  setTimeout(() => {
    out(result(false, JSON.stringify({ title: "면접 예상 질문 3개만 적어 보기", question: null, shortcut: null })));
  }, Number(process.env.FAKE_DELAY ?? 3) * 1000);
});
