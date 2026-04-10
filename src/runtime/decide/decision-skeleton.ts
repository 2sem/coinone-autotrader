import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildRunId } from "../../agent/snapshot.js";
import type { RuntimeAnalysis, RuntimeDecision, RuntimeSnapshot } from "../contracts/index.js";
import { validateRuntimeDecision } from "../contracts/index.js";

const DEFAULT_OUTPUT_DIR = "artifacts/runtime";

export function createRuntimeDecisionSkeleton(snapshot: RuntimeSnapshot, analysis: RuntimeAnalysis): RuntimeDecision {
  const createdAt = new Date().toISOString();
  const primaryCandidate = analysis.candidateTargets[0];
  const primaryFeeProfile = analysis.feeProfiles.find((profile) => profile.target === primaryCandidate?.target);

  return validateRuntimeDecision({
    schemaVersion: "1",
    decisionId: buildRunId("runtime-decision", createdAt),
    snapshotId: snapshot.snapshotId,
    analysisId: analysis.analysisId,
    createdAt,
    action: "hold",
    target: primaryCandidate?.target,
    confidence: Math.max(primaryCandidate?.confidence ?? 0.3, 0.3),
    strategyPreset: primaryFeeProfile?.preset ?? "standard-net-profit",
    estimatedMakerFeeBps: primaryFeeProfile?.makerFeeBps,
    estimatedTakerFeeBps: primaryFeeProfile?.takerFeeBps,
    thesis: "hold until AI finalizes the trading thesis",
    reasoningEn: "AI should replace this default reasoning with a concise final explanation based on the snapshot and analysis.",
    userSummaryKo: `${primaryCandidate?.target ?? "선택 코인"}은 현재 기본 안전 판단상 보류 상태에서 시작합니다.`,
    riskNotes: analysis.risks,
    executionPlan: {
      mode: "none"
    }
  });
}

export async function writeRuntimeDecisionSkeleton(
  decision: RuntimeDecision,
  outputDir = DEFAULT_OUTPUT_DIR
): Promise<{ latestPath: string; datedPath: string }> {
  const decisionDir = path.resolve(outputDir, "decisions");
  await mkdir(decisionDir, { recursive: true });

  const fileName = `${decision.createdAt.replace(/[:.]/g, "-")}.json`;
  const latestPath = path.join(decisionDir, "latest.json");
  const datedPath = path.join(decisionDir, fileName);

  await Promise.all([
    writeFile(latestPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8"),
    writeFile(datedPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8")
  ]);

  return { latestPath, datedPath };
}
