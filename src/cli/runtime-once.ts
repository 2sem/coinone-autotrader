import { loadConfig } from "../config/env.js";
import { collectRuntimeSnapshot, writeRuntimeSnapshot } from "../runtime/collect/snapshot.js";
import { analyzeRuntimeSnapshot, writeRuntimeAnalysis } from "../runtime/analyze/market-analysis.js";
import { runRuntimeDecision, writeRuntimeDecision } from "../runtime/decide/decision-run.js";
import { runRuntimeRuleValidation, writeRuntimeRuleValidation } from "../runtime/validate/rule-validation.js";
import { runRuntimeReview, writeRuntimeReview } from "../runtime/review/review-run.js";
import { ensureDailyIssueAndAppendComment } from "../runtime/logging/trade-comment.js";
import {
  createRuntimeStatusArtifact,
  finalizeRuntimeResult,
  markRuntimeStepCompleted,
  markRuntimeStepFailed,
  writeRuntimeStatusArtifact
} from "../runtime/status-store.js";

async function main(): Promise<void> {
  const config = loadConfig();
  let status = createRuntimeStatusArtifact();
  await writeRuntimeStatusArtifact(status);

  try {
    const snapshot = await collectRuntimeSnapshot(config);
    const snapshotPaths = await writeRuntimeSnapshot(snapshot);
    status = markRuntimeStepCompleted(status, "collect:snapshot", "정보 수집 완료", snapshotPaths.latestPath);
    await writeRuntimeStatusArtifact(status);
    console.log("[runtime:once] 정보 수집 완료");

    const analysis = analyzeRuntimeSnapshot(snapshot);
    const analysisPaths = await writeRuntimeAnalysis(analysis);
    status = markRuntimeStepCompleted(status, "analyze:market", "분석 완료", analysisPaths.latestPath);
    await writeRuntimeStatusArtifact(status);
    console.log("[runtime:once] 분석 완료");

    const decision = runRuntimeDecision(snapshot, analysis, config);
    const decisionPaths = await writeRuntimeDecision(decision);
    status = markRuntimeStepCompleted(status, "decision:run", "의사결정 완료", decisionPaths.latestPath);
    await writeRuntimeStatusArtifact(status);
    console.log("[runtime:once] 의사결정 완료");

    const validation = runRuntimeRuleValidation(snapshot, decision, config);
    const validationPaths = await writeRuntimeRuleValidation(validation);
    status = markRuntimeStepCompleted(status, "rule:validate", "기본 안전 규칙 점검 완료", validationPaths.latestPath);
    await writeRuntimeStatusArtifact(status);
    console.log("[runtime:once] 기본 안전 규칙 점검 완료");

    const review = runRuntimeReview(snapshot, analysis, decision, validation);
    const reviewPaths = await writeRuntimeReview(review);
    status = markRuntimeStepCompleted(status, "decision:review", "검토 완료", reviewPaths.latestPath);
    await writeRuntimeStatusArtifact(status);
    console.log("[runtime:once] 검토 완료");

    const result = await ensureDailyIssueAndAppendComment({ config, snapshot, analysis, decision, review });
    status = markRuntimeStepCompleted(status, "log:trade-comment", `일일 기록 반영 완료 (#${result.issue.issueNumber})`, result.paths.latestPath);
    status = finalizeRuntimeResult(status, classifyRuntimeResult(decision, review));
    await writeRuntimeStatusArtifact(status);
    console.log(`[runtime:once] 일일 기록 반영 완료 (#${result.issue.issueNumber})`);
    console.log(`[runtime:once] 최종 결과: ${status.result}${status.result === "pending" ? ` (${status.pendingReason})` : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedStep = status.currentStep === "done" ? "log:trade-comment" : status.currentStep;
    status = markRuntimeStepFailed(status, failedStep, message);
    await writeRuntimeStatusArtifact(status);
    throw error;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[runtime:once] ${message}`);
  process.exitCode = 1;
});

function classifyRuntimeResult(
  decision: { action: "buy" | "sell" | "hold"; userSummaryKo: string },
  review: { approved: boolean; operatorActionRequired: boolean }
): { result: "trade" | "pending"; pendingReason: "cooldown" | "approval-needed" | "review-blocked" | "hold" | "none" } {
  if (!review.approved) {
    return {
      result: "pending",
      pendingReason: review.operatorActionRequired ? "approval-needed" : "review-blocked"
    };
  }

  if (decision.action === "hold") {
    return {
      result: "pending",
      pendingReason: decision.userSummaryKo.includes("쿨다운") || decision.userSummaryKo.includes("대기") ? "cooldown" : "hold"
    };
  }

  return {
    result: "trade",
    pendingReason: "none"
  };
}
