import { loadConfig } from "../config/env.js";
import { collectRuntimeSnapshot, writeRuntimeSnapshot } from "../runtime/collect/snapshot.js";
import { analyzeRuntimeSnapshot, writeRuntimeAnalysis } from "../runtime/analyze/market-analysis.js";
import { runRuntimeDecision, writeRuntimeDecision } from "../runtime/decide/decision-run.js";
import { runRuntimeRuleValidation, writeRuntimeRuleValidation } from "../runtime/validate/rule-validation.js";
import { runRuntimeReview, writeRuntimeReview } from "../runtime/review/review-run.js";
import { ensureDailyIssueAndAppendComment } from "../runtime/logging/trade-comment.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const snapshot = await collectRuntimeSnapshot(config);
  await writeRuntimeSnapshot(snapshot);
  console.log("[runtime:once] 정보 수집 완료");

  const analysis = analyzeRuntimeSnapshot(snapshot);
  await writeRuntimeAnalysis(analysis);
  console.log("[runtime:once] 분석 완료");

  const decision = runRuntimeDecision(snapshot, analysis, config);
  await writeRuntimeDecision(decision);
  console.log("[runtime:once] 의사결정 완료");

  const validation = runRuntimeRuleValidation(snapshot, decision, config);
  await writeRuntimeRuleValidation(validation);
  console.log("[runtime:once] 기본 안전 규칙 점검 완료");

  const review = runRuntimeReview(snapshot, analysis, decision, validation);
  await writeRuntimeReview(review);
  console.log("[runtime:once] 검토 완료");

  const result = await ensureDailyIssueAndAppendComment({ config, snapshot, analysis, decision, review });
  console.log(`[runtime:once] 일일 기록 반영 완료 (#${result.issue.issueNumber})`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[runtime:once] ${message}`);
  process.exitCode = 1;
});
