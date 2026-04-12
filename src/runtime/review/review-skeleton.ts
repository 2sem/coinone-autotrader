import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildRunId } from "../../agent/snapshot.js";
import type { RuntimeDecision, RuntimeReview, RuntimeRuleValidation } from "../contracts/index.js";
import { validateRuntimeReview } from "../contracts/index.js";

const DEFAULT_OUTPUT_DIR = "artifacts/runtime";

export function createRuntimeReviewSkeleton(decision: RuntimeDecision, validation: RuntimeRuleValidation): RuntimeReview {
  const createdAt = new Date().toISOString();
  const approvedByDefault = validation.passed;

  return validateRuntimeReview({
    schemaVersion: "1",
    reviewId: buildRunId("runtime-review", createdAt),
    decisionId: decision.decisionId,
    validationId: validation.validationId,
    createdAt,
    approved: approvedByDefault,
    blockedReasons: approvedByDefault ? [] : validation.blockedReasons.length > 0 ? validation.blockedReasons : ["Awaiting final AI review completion."],
    riskFlags: validation.warnings,
    operatorActionRequired: !approvedByDefault && validation.blockedReasons.length > 0,
    reviewSummaryKo: approvedByDefault
      ? "기본 검토 단계에서는 현재 조건을 통과한 상태에서 시작합니다."
      : "기본 검토 단계에서는 보수적으로 승인 전 상태에서 시작합니다.",
    reviewNotesEn: approvedByDefault
      ? "AI should confirm or tighten this review only if there is a concrete safety reason."
      : "AI should replace this default review note with concise final review reasoning."
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
