import { readLatestReviewInputs, runRuntimeReview, writeRuntimeReview } from "../runtime/review/review-run.js";

async function main(): Promise<void> {
  const { snapshot, analysis, decision, validation } = await readLatestReviewInputs();
  const review = runRuntimeReview(snapshot, analysis, decision, validation);
  const paths = await writeRuntimeReview(review);

  console.log(
    [
      "[decision:review] 검토 결과를 저장했습니다.",
      `[decision:review] 승인 여부: ${review.approved ? "승인" : "보류"}`,
      `[decision:review] 요약: ${review.reviewSummaryKo}`,
      `[decision:review] 저장 위치: ${paths.latestPath}`
    ].join("\n")
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[decision:review] ${message}`);
  process.exitCode = 1;
});
