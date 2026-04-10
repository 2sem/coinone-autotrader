import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "../../config/env.js";
import { buildRunId } from "../../agent/snapshot.js";
import type { RuntimeDecision, RuntimeRuleValidation, RuntimeSnapshot } from "../contracts/index.js";
import { validateRuntimeDecision, validateRuntimeRuleValidation, validateRuntimeSnapshot } from "../contracts/index.js";

const DEFAULT_OUTPUT_DIR = "artifacts/runtime";

export function runRuntimeRuleValidation(snapshot: RuntimeSnapshot, decision: RuntimeDecision, config: AppConfig): RuntimeRuleValidation {
  const createdAt = new Date().toISOString();
  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  const checkedRules = [
    "target-selected",
    "account-configured",
    "execution-plan-shape",
    "decision-placeholders-cleared",
    "order-value-cap",
    "live-submit-still-blocked"
  ];

  if (decision.action !== "hold" && decision.target && !snapshot.market.selectedTargets.includes(decision.target)) {
    blockedReasons.push("Decision target is not part of the current selected targets.");
  }

  if ((decision.action === "buy" || decision.action === "sell") && !snapshot.account.configured) {
    blockedReasons.push("Executable actions require configured account data.");
  }

  if (decision.action === "buy") {
    if (decision.executionPlan.mode === "none") {
      blockedReasons.push("Buy decisions must include an execution plan.");
    }

    if (!decision.executionPlan.totalOrderValueKrw || decision.executionPlan.totalOrderValueKrw <= 0) {
      blockedReasons.push("Buy decisions must include a positive totalOrderValueKrw.");
    }

    if (decision.executionPlan.totalOrderValueKrw && decision.executionPlan.totalOrderValueKrw > config.riskControls.maxOrderKrw) {
      blockedReasons.push(`Order value exceeds MAX_ORDER_KRW=${config.riskControls.maxOrderKrw}.`);
    }

    if ((decision.executionPlan.entries?.length ?? 0) === 0) {
      warnings.push("Ladder buy plan has no entries; execution would still stay blocked later.");
    }
  }

  if (decision.thesis === "replace-me" || decision.reasoningEn.includes("Replace this placeholder") || decision.userSummaryKo.includes("초안")) {
    blockedReasons.push("Decision still contains placeholder text and must be completed before review can approve it.");
  }

  if (decision.executionPlan.mode === "ladder" && (!decision.executionPlan.splitCount || decision.executionPlan.splitCount <= 0)) {
    blockedReasons.push("Ladder execution plans must include a positive splitCount.");
  }

  if (decision.action === "sell" && decision.executionPlan.mode === "none") {
    blockedReasons.push("Sell decisions must describe how to reduce the position.");
  }

  if (!config.enableLiveTrading || config.dryRun) {
    warnings.push("Live submission remains blocked by current runtime settings.");
  }

  return validateRuntimeRuleValidation({
    schemaVersion: "1",
    validationId: buildRunId("runtime-validation", createdAt),
    decisionId: decision.decisionId,
    createdAt,
    passed: blockedReasons.length === 0,
    blockedReasons,
    warnings,
    checkedRules,
    summaryKo: blockedReasons.length === 0
      ? "기본 안전 규칙을 통과했습니다."
      : "기본 안전 규칙에서 보완이 필요한 항목이 있습니다."
  });
}

export async function writeRuntimeRuleValidation(
  validation: RuntimeRuleValidation,
  outputDir = DEFAULT_OUTPUT_DIR
): Promise<{ latestPath: string; datedPath: string }> {
  const validationDir = path.resolve(outputDir, "validations");
  await mkdir(validationDir, { recursive: true });

  const fileName = `${validation.createdAt.replace(/[:.]/g, "-")}.json`;
  const latestPath = path.join(validationDir, "latest.json");
  const datedPath = path.join(validationDir, fileName);

  await Promise.all([writeJson(latestPath, validation), writeJson(datedPath, validation)]);
  return { latestPath, datedPath };
}

export async function readLatestRuntimeValidation(outputDir = DEFAULT_OUTPUT_DIR): Promise<RuntimeRuleValidation> {
  const latestPath = path.resolve(outputDir, "validations", "latest.json");
  const raw = await readFile(latestPath, "utf8");
  return validateRuntimeRuleValidation(JSON.parse(raw));
}

export async function readLatestSnapshotAndDecision(outputDir = DEFAULT_OUTPUT_DIR): Promise<{
  snapshot: RuntimeSnapshot;
  decision: RuntimeDecision;
}> {
  const [snapshotRaw, decisionRaw] = await Promise.all([
    readFile(path.resolve(outputDir, "snapshots", "latest.json"), "utf8"),
    readFile(path.resolve(outputDir, "decisions", "latest.json"), "utf8")
  ]);

  return {
    snapshot: validateRuntimeSnapshot(JSON.parse(snapshotRaw)),
    decision: validateRuntimeDecision(JSON.parse(decisionRaw))
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
