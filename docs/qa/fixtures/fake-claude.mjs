// 시나리오용 가짜 claude (Node). 맥·윈도우 어디서나 같은 동작: 첫 행동 요청에 FAKE_DELAY초(기본 3) 뒤 답한다.
// 부를 때마다 FAKE_LOG에 받은 인자를 한 줄 남긴다(윈도우 claude.cmd 실행에서 인자가 안 깨졌는지 확인용).
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("2.1.304 (Claude Code)");
  process.exit(0);
}
if (args[0] === "mcp") {
  console.log("No MCP servers configured.");
  process.exit(0);
}
let body = "";
process.stdin.on("data", (d) => (body += d));
process.stdin.on("end", () => {
  if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, bytes: body.length }) + "\n");
  setTimeout(() => {
    const result = JSON.stringify({ title: "면접 예상 질문 3개만 적어 보기", question: null, shortcut: null });
    process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, result }));
  }, Number(process.env.FAKE_DELAY ?? 3) * 1000);
});
