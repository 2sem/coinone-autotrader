import type { RuntimeAnalysis, RuntimeDecision, RuntimeRuleValidation, RuntimeSnapshot } from "../contracts/index.js";

export function buildReviewPrompt(
  snapshot: RuntimeSnapshot,
  analysis: RuntimeAnalysis,
  decision: RuntimeDecision,
  validation: RuntimeRuleValidation
): string {
  return [
    "You are the review agent.",
    "Check whether the proposed trading decision remains acceptable after deterministic rule validation.",
    "If there is uncertainty, prefer rejecting the action with concise reasons.",
    `Snapshot=${snapshot.snapshotId}.`,
    `Analysis=${analysis.analysisId}.`,
    `Decision=${decision.decisionId} action=${decision.action}.`,
    `Validation passed=${validation.passed}.`
  ].join(" ");
}
