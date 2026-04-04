import { loadConfig } from "../config/env.js";
import { readLatestRuntimeDecision, readLatestRuntimeInputs } from "../runtime/decide/decision-run.js";
import { readLatestRuntimeReview } from "../runtime/review/review-run.js";
import { ensureDailyIssueAndAppendComment } from "../runtime/logging/trade-comment.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const { snapshot, analysis } = await readLatestRuntimeInputs();
  const decision = await readLatestRuntimeDecision();
  const review = await readLatestRuntimeReview();
  const result = await ensureDailyIssueAndAppendComment({ config, snapshot, analysis, decision, review });

  console.log(
    [
      "[log:trade-comment] 일일 이슈를 확인했습니다.",
      `[log:trade-comment] 이슈: #${result.issue.issueNumber}`,
      `[log:trade-comment] 댓글을 추가했습니다.`,
      `[log:trade-comment] 링크: ${result.issue.issueUrl}`
    ].join("\n")
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[log:trade-comment] ${message}`);
  process.exitCode = 1;
});
