import { loadConfig } from "../config/env.js";
import { refreshWeeklyIssueBody } from "../runtime/reporting/weekly-refresh.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const result = await refreshWeeklyIssueBody(config);

  console.log(
    [
      "[report:weekly-refresh] 주간 요약을 갱신했습니다.",
      `[report:weekly-refresh] 이슈: #${result.issueNumber}`,
      `[report:weekly-refresh] 일일 이슈 수: ${result.dailyIssueCount}`,
      `[report:weekly-refresh] 댓글 수: ${result.totalComments}`,
      `[report:weekly-refresh] 링크: ${result.issueUrl}`
    ].join("\n")
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[report:weekly-refresh] ${message}`);
  process.exitCode = 1;
});
