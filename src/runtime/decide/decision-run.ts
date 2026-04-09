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
  const primaryFeeProfile = analysis.feeProfiles.find((profile) => profile.target === primaryCandidate?.target);
  const primaryPosition = snapshot.portfolio.positions.find((position) => position.target === primaryCandidate?.target);
  const availableKrw = Number(snapshot.account.availableKrw) || 0;
  const heldQuantity = Number(primaryPosition?.heldQuantity) || 0;
  const recentOrderRecencyMinutes = primaryPosition?.recentOrderAt ? computeRecencyMinutes(primaryPosition.recentOrderAt, createdAt) : undefined;
  const cooldownActive = recentOrderRecencyMinutes !== undefined && recentOrderRecencyMinutes < config.riskControls.cooldownMinutes;
  const conservativeBudget = Math.max(0, Math.min(config.riskControls.maxOrderKrw, availableKrw * config.riskControls.buyFractionOfCash));
  const stablecoinBias = snapshot.market.selectedTargets.some((target) => config.stablecoinTargets.includes(target));
  const shouldBuy =
    snapshot.account.configured &&
    primaryCandidate?.bias === "buy" &&
    heldQuantity === 0 &&
    !cooldownActive &&
    primaryFeeProfile?.preset !== "standard-net-profit" &&
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
    confidence: shouldBuy ? primaryCandidate.confidence : shouldSell ? Math.max(primaryCandidate?.confidence ?? 0.4, 0.55) : cooldownActive ? 0.7 : 0.4,
    strategyPreset: primaryFeeProfile?.preset ?? "standard-net-profit",
    estimatedMakerFeeBps: primaryFeeProfile?.makerFeeBps,
    estimatedTakerFeeBps: primaryFeeProfile?.takerFeeBps,
    thesis: buildThesis(action, stablecoinBias, cooldownActive, primaryFeeProfile?.preset),
    reasoningEn: buildDecisionPrompt(snapshot, analysis, config),
    userSummaryKo: buildUserSummary(action, primaryCandidate?.target, snapshot.account.configured, cooldownActive, config.riskControls.cooldownMinutes, recentOrderRecencyMinutes),
    riskNotes: cooldownActive
      ? [...analysis.risks, `Cooldown remains active for ${config.riskControls.cooldownMinutes - (recentOrderRecencyMinutes ?? 0)} more minutes.`]
      : analysis.risks,
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

function buildThesis(
  action: RuntimeDecision["action"],
  stablecoinBias: boolean,
  cooldownActive: boolean,
  strategyPreset: RuntimeDecision["strategyPreset"] | undefined
): string {
  if (cooldownActive) {
    return "cooldown protection";
  }

  if (strategyPreset === "zero-fee-grid") {
    return action === "hold" ? "zero-fee grid pause" : "zero-fee grid rotation";
  }

  if (strategyPreset === "low-fee-balance") {
    return action === "hold" ? "low-fee balance wait" : "low-fee balanced rotation";
  }

  if (action === "buy") {
    return stablecoinBias ? "stablecoin ladder accumulation" : "conservative split entry";
  }

  if (action === "sell") {
    return "position reduction";
  }

  return "wait for clearer setup";
}

function buildUserSummary(
  action: RuntimeDecision["action"],
  target: string | undefined,
  accountConfigured: boolean,
  cooldownActive: boolean,
  cooldownMinutes: number,
  recentOrderRecencyMinutes: number | undefined
): string {
  if (!accountConfigured) {
    return "계좌 정보를 충분히 확인하지 못해 이번 판단은 보류했습니다.";
  }

  if (cooldownActive) {
    const remaining = Math.max(0, cooldownMinutes - (recentOrderRecencyMinutes ?? 0));
    return `${target ?? "선택 코인"}은 최근 체결 이후 쿨다운이 ${remaining}분 남아 있어 이번에는 기다립니다.`;
  }

  if (action === "buy") {
    return `${target ?? "선택 코인"}는 현재 소액 분할 매수를 검토할 수 있습니다.`;
  }

  if (action === "sell") {
    return `${target ?? "보유 코인"}는 일부 정리를 검토할 수 있습니다.`;
  }

  return "이번에는 매수나 매도보다 보류가 더 안전하다고 판단했습니다.";
}

function computeRecencyMinutes(previousAt: string, currentAt: string): number | undefined {
  const previous = Date.parse(previousAt);
  const current = Date.parse(currentAt);
  if (!Number.isFinite(previous) || !Number.isFinite(current) || current < previous) {
    return undefined;
  }

  return Math.floor((current - previous) / 60000);
}

function roundKrw(value: number): number {
  return Math.max(0, Math.floor(value / 1000) * 1000);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
