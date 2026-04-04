import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildRunId } from "../../agent/snapshot.js";
import type { RuntimeAnalysis, RuntimeDecision, RuntimeReview, RuntimeRuleValidation, RuntimeSnapshot } from "../contracts/index.js";
import {
  validateRuntimeAnalysis,
  validateRuntimeDecision,
  validateRuntimeReview,
  validateRuntimeRuleValidation,
  validateRuntimeSnapshot
} from "../contracts/index.js";
import { buildReviewPrompt } from "./prompt.js";

const DEFAULT_OUTPUT_DIR = "artifacts/runtime";

export function runRuntimeReview(
  snapshot: RuntimeSnapshot,
  analysis: RuntimeAnalysis,
  decision: RuntimeDecision,
  validation: RuntimeRuleValidation
): RuntimeReview {
  const createdAt = new Date().toISOString();
  const approved = validation.passed && (decision.action === "hold" || decision.confidence >= 0.45);
  const blockedReasons = approved
    ? []
    : validation.blockedReasons.length > 0
      ? validation.blockedReasons
      : ["Decision confidence is too low for execution."];
  const riskFlags = [
    ...validation.warnings,
    ...(analysis.risks.length > 0 ? analysis.risks : [])
  ];

  return validateRuntimeReview({
    schemaVersion: "1",
    reviewId: buildRunId("runtime-review", createdAt),
    decisionId: decision.decisionId,
    validationId: validation.validationId,
    createdAt,
    approved,
    blockedReasons,
    riskFlags,
    operatorActionRequired: blockedReasons.length > 0,
    reviewSummaryKo: approved
      ? `${decision.target ?? "이번 판단"}은 현재 기준에서 진행 가능한 후보로 봅니다.`
      : `${decision.target ?? "이번 판단"}은 추가 확인이 필요해 보류합니다.`,
    reviewNotesEn: buildReviewPrompt(snapshot, analysis, decision, validation)
  });
}

export async function writeRuntimeReview(review: RuntimeReview, outputDir = DEFAULT_OUTPUT_DIR): Promise<{ latestPath: string; datedPath: string }> {
  const reviewDir = path.resolve(outputDir, "reviews");
  await mkdir(reviewDir, { recursive: true });

  const fileName = `${review.createdAt.replace(/[:.]/g, "-")}.json`;
  const latestPath = path.join(reviewDir, "latest.json");
  const datedPath = path.join(reviewDir, fileName);

  await Promise.all([writeJson(latestPath, review), writeJson(datedPath, review)]);
  return { latestPath, datedPath };
}

export async function readLatestRuntimeReview(outputDir = DEFAULT_OUTPUT_DIR): Promise<RuntimeReview> {
  const latestPath = path.resolve(outputDir, "reviews", "latest.json");
  const raw = await readFile(latestPath, "utf8");
  return validateRuntimeReview(JSON.parse(raw));
}

export async function readLatestReviewInputs(outputDir = DEFAULT_OUTPUT_DIR): Promise<{
  snapshot: RuntimeSnapshot;
  analysis: RuntimeAnalysis;
  decision: RuntimeDecision;
  validation: RuntimeRuleValidation;
}> {
  const [snapshotRaw, analysisRaw, decisionRaw, validationRaw] = await Promise.all([
    readFile(path.resolve(outputDir, "snapshots", "latest.json"), "utf8"),
    readFile(path.resolve(outputDir, "analysis", "latest.json"), "utf8"),
    readFile(path.resolve(outputDir, "decisions", "latest.json"), "utf8"),
    readFile(path.resolve(outputDir, "validations", "latest.json"), "utf8")
  ]);

  return {
    snapshot: validateRuntimeSnapshot(JSON.parse(snapshotRaw)),
    analysis: validateRuntimeAnalysis(JSON.parse(analysisRaw)),
    decision: validateRuntimeDecision(JSON.parse(decisionRaw)),
    validation: validateRuntimeRuleValidation(JSON.parse(validationRaw))
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
