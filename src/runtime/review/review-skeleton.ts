import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildRunId } from "../../agent/snapshot.js";
import type { RuntimeDecision, RuntimeReview, RuntimeRuleValidation } from "../contracts/index.js";
import { validateRuntimeReview } from "../contracts/index.js";

const DEFAULT_OUTPUT_DIR = "artifacts/runtime";

export function createRuntimeReviewSkeleton(decision: RuntimeDecision, validation: RuntimeRuleValidation): RuntimeReview {
  const createdAt = new Date().toISOString();

  return validateRuntimeReview({
    schemaVersion: "1",
    reviewId: buildRunId("runtime-review", createdAt),
    decisionId: decision.decisionId,
    validationId: validation.validationId,
    createdAt,
    approved: false,
    blockedReasons: validation.blockedReasons,
    riskFlags: validation.warnings,
    operatorActionRequired: validation.blockedReasons.length > 0,
    reviewSummaryKo: "이 검토 초안은 아직 AI 검토 전입니다.",
    reviewNotesEn: "Replace this placeholder with concise review notes."
  });
}

export async function writeRuntimeReviewSkeleton(
  review: RuntimeReview,
  outputDir = DEFAULT_OUTPUT_DIR
): Promise<{ latestPath: string; datedPath: string }> {
  const reviewDir = path.resolve(outputDir, "reviews");
  await mkdir(reviewDir, { recursive: true });

  const fileName = `${review.createdAt.replace(/[:.]/g, "-")}.json`;
  const latestPath = path.join(reviewDir, "latest.json");
  const datedPath = path.join(reviewDir, fileName);

  await Promise.all([
    writeFile(latestPath, `${JSON.stringify(review, null, 2)}\n`, "utf8"),
    writeFile(datedPath, `${JSON.stringify(review, null, 2)}\n`, "utf8")
  ]);

  return { latestPath, datedPath };
}
