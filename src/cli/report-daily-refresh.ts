import { loadConfig } from "../config/env.js";
import { refreshDailyIssueBody } from "../runtime/reporting/daily-refresh.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const result = await refreshDailyIssueBody(config);

  console.log(
    [
      "[report:daily-refresh] 일일 요약을 갱신했습니다.",
      `[report:daily-refresh] 이슈: #${result.issueNumber}`,
      `[report:daily-refresh] 댓글 수: ${result.commentCount}`,
      `[report:daily-refresh] 링크: ${result.issueUrl}`
    ].join("\n")
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[report:daily-refresh] ${message}`);
  process.exitCode = 1;
});
