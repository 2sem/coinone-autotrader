import { readLatestRuntimeDecision } from "../runtime/decide/decision-run.js";
import { readLatestRuntimeValidation } from "../runtime/validate/rule-validation.js";
import { createRuntimeReviewSkeleton, writeRuntimeReviewSkeleton } from "../runtime/review/review-skeleton.js";

async function main(): Promise<void> {
  const decision = await readLatestRuntimeDecision();
  const validation = await readLatestRuntimeValidation();
  const review = createRuntimeReviewSkeleton(decision, validation);
  const paths = await writeRuntimeReviewSkeleton(review);

  console.log(
    [
      "[review:skeleton] AI review 초안을 저장했습니다.",
      `[review:skeleton] 저장 위치: ${paths.latestPath}`
    ].join("\n")
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[review:skeleton] ${message}`);
  process.exitCode = 1;
});
