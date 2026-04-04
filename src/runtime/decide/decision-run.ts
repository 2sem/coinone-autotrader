import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "../../config/env.js";
import { buildRunId } from "../../agent/snapshot.js";
import type { RuntimeAnalysis, RuntimeDecision, RuntimeSnapshot } from "../contracts/index.js";
import { validateRuntimeAnalysis, validateRuntimeDecision, validateRuntimeSnapshot } from "../contracts/index.js";
import { buildDecisionPrompt } from "./prompt.js";

const DEFAULT_OUTPUT_DIR = "artifacts/runtime";

export function runRuntimeDecision(snapshot: RuntimeSnapshot, analysis: RuntimeAnalysis, config: AppConfig): RuntimeDecision {
  const createdAt = new Date().toISOString();
  const primaryCandidate = analysis.candidateTargets[0];
  const primaryPosition = snapshot.portfolio.positions.find((position) => position.target === primaryCandidate?.target);
  const availableKrw = Number(snapshot.account.availableKrw) || 0;
  const heldQuantity = Number(primaryPosition?.heldQuantity) || 0;
  const conservativeBudget = Math.max(0, Math.min(config.riskControls.maxOrderKrw, availableKrw * config.riskControls.buyFractionOfCash));
  const stablecoinBias = snapshot.market.selectedTargets.some((target) => config.stablecoinTargets.includes(target));
  const shouldBuy =
    snapshot.account.configured &&
    primaryCandidate?.bias === "buy" &&
    heldQuantity === 0 &&
    conservativeBudget >= 10000;
  const shouldSell = snapshot.account.configured && primaryCandidate?.bias === "sell" && heldQuantity > 0;
  const action = shouldBuy ? "buy" : shouldSell ? "sell" : "hold";
  const splitCount = action === "hold" ? undefined : 5;
  const totalOrderValueKrw = action === "buy"
    ? roundKrw(Math.min(conservativeBudget, stablecoinBias ? 50_000 : conservativeBudget))
    : undefined;

  const entries = action === "buy" && totalOrderValueKrw
    ? buildLadderEntries(totalOrderValueKrw, splitCount ?? 5)
    : undefined;
  const exits = action === "sell"
    ? [
        { priceOffsetPct: 0.3, sellFraction: 0.5 },
        { priceOffsetPct: 0.6, sellFraction: 0.5 }
      ]
    : undefined;

  return validateRuntimeDecision({
    schemaVersion: "1",
    decisionId: buildRunId("runtime-decision", createdAt),
    snapshotId: snapshot.snapshotId,
    analysisId: analysis.analysisId,
    createdAt,
    action,
    target: primaryCandidate?.target,
    confidence: shouldBuy ? primaryCandidate.confidence : shouldSell ? Math.max(primaryCandidate?.confidence ?? 0.4, 0.55) : 0.4,
    thesis: buildThesis(action, stablecoinBias),
    reasoningEn: buildDecisionPrompt(snapshot, analysis, config),
    userSummaryKo: buildUserSummary(action, primaryCandidate?.target, snapshot.account.configured),
    riskNotes: analysis.risks,
    executionPlan: {
      mode: action === "hold" ? "none" : action === "buy" ? "ladder" : "single",
      totalOrderValueKrw,
      splitCount,
      entries,
      exits
    }
  });
}

export async function writeRuntimeDecision(decision: RuntimeDecision, outputDir = DEFAULT_OUTPUT_DIR): Promise<{ latestPath: string; datedPath: string }> {
  const decisionDir = path.resolve(outputDir, "decisions");
  await mkdir(decisionDir, { recursive: true });

  const fileName = `${decision.createdAt.replace(/[:.]/g, "-")}.json`;
  const latestPath = path.join(decisionDir, "latest.json");
  const datedPath = path.join(decisionDir, fileName);

  await Promise.all([writeJson(latestPath, decision), writeJson(datedPath, decision)]);
  return { latestPath, datedPath };
}

export async function readLatestRuntimeDecision(outputDir = DEFAULT_OUTPUT_DIR): Promise<RuntimeDecision> {
  const latestPath = path.resolve(outputDir, "decisions", "latest.json");
  const raw = await readFile(latestPath, "utf8");
  return validateRuntimeDecision(JSON.parse(raw));
}

export async function readLatestRuntimeInputs(outputDir = DEFAULT_OUTPUT_DIR): Promise<{ snapshot: RuntimeSnapshot; analysis: RuntimeAnalysis }> {
  const [snapshotRaw, analysisRaw] = await Promise.all([
    readFile(path.resolve(outputDir, "snapshots", "latest.json"), "utf8"),
    readFile(path.resolve(outputDir, "analysis", "latest.json"), "utf8")
  ]);

  return {
    snapshot: validateRuntimeSnapshot(JSON.parse(snapshotRaw)),
    analysis: validateRuntimeAnalysis(JSON.parse(analysisRaw))
  };
}

function buildLadderEntries(totalOrderValueKrw: number, splitCount: number) {
  const unit = roundKrw(totalOrderValueKrw / splitCount);
  return Array.from({ length: splitCount }, (_, index) => ({
    priceOffsetPct: Number((-(index + 1) * 0.1).toFixed(2)),
    valueKrw: unit
  }));
}

function buildThesis(action: RuntimeDecision["action"], stablecoinBias: boolean): string {
  if (action === "buy") {
    return stablecoinBias ? "stablecoin ladder accumulation" : "conservative split entry";
  }

  if (action === "sell") {
    return "position reduction";
  }

  return "wait for clearer setup";
}

function buildUserSummary(action: RuntimeDecision["action"], target: string | undefined, accountConfigured: boolean): string {
  if (!accountConfigured) {
    return "계좌 정보를 충분히 확인하지 못해 이번 판단은 보류했습니다.";
  }

  if (action === "buy") {
    return `${target ?? "선택 코인"}는 현재 소액 분할 매수를 검토할 수 있습니다.`;
  }

  if (action === "sell") {
    return `${target ?? "보유 코인"}는 일부 정리를 검토할 수 있습니다.`;
  }

  return "이번에는 매수나 매도보다 보류가 더 안전하다고 판단했습니다.";
}

function roundKrw(value: number): number {
  return Math.max(0, Math.floor(value / 1000) * 1000);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
