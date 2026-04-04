import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildRunId } from "../../agent/snapshot.js";
import type { RuntimeAnalysis, RuntimeAnalysisCandidate, RuntimePortfolioState, RuntimeSnapshot } from "../contracts/index.js";
import { validateRuntimeAnalysis, validateRuntimeSnapshot } from "../contracts/index.js";

const DEFAULT_OUTPUT_DIR = "artifacts/runtime";

export function analyzeRuntimeSnapshot(snapshot: RuntimeSnapshot): RuntimeAnalysis {
  const createdAt = new Date().toISOString();
  const marketRegime = determineMarketRegime(snapshot);
  const portfolioState = determinePortfolioState(snapshot);
  const candidateTargets = buildCandidateTargets(snapshot, portfolioState);
  const risks = buildRiskNotes(snapshot, portfolioState, marketRegime);

  return validateRuntimeAnalysis({
    schemaVersion: "1",
    analysisId: buildRunId("runtime-analysis", createdAt),
    snapshotId: snapshot.snapshotId,
    createdAt,
    marketRegime,
    portfolioState,
    candidateTargets,
    risks,
    analysisSummaryEn: buildEnglishSummary(snapshot, marketRegime, portfolioState, candidateTargets, risks),
    userSummaryKo: buildKoreanSummary(snapshot, marketRegime, portfolioState, candidateTargets)
  });
}

export async function writeRuntimeAnalysis(analysis: RuntimeAnalysis, outputDir = DEFAULT_OUTPUT_DIR): Promise<{ latestPath: string; datedPath: string }> {
  const analysisDir = path.resolve(outputDir, "analysis");
  await mkdir(analysisDir, { recursive: true });

  const fileName = `${analysis.createdAt.replace(/[:.]/g, "-")}.json`;
  const latestPath = path.join(analysisDir, "latest.json");
  const datedPath = path.join(analysisDir, fileName);

  await Promise.all([writeJson(latestPath, analysis), writeJson(datedPath, analysis)]);
  return { latestPath, datedPath };
}

export async function readLatestRuntimeAnalysis(outputDir = DEFAULT_OUTPUT_DIR): Promise<RuntimeAnalysis> {
  const latestPath = path.resolve(outputDir, "analysis", "latest.json");
  const raw = await readFile(latestPath, "utf8");
  return validateRuntimeAnalysis(JSON.parse(raw));
}

export async function readLatestSnapshotForAnalysis(outputDir = DEFAULT_OUTPUT_DIR): Promise<RuntimeSnapshot> {
  const latestPath = path.resolve(outputDir, "snapshots", "latest.json");
  const raw = await readFile(latestPath, "utf8");
  return validateRuntimeSnapshot(JSON.parse(raw));
}

function determineMarketRegime(snapshot: RuntimeSnapshot): RuntimeAnalysis["marketRegime"] {
  const tickers = snapshot.market.tickers.filter((ticker) => ticker.bestBidPrice && ticker.bestAskPrice && ticker.last);

  if (tickers.length === 0) {
    return "unclear";
  }

  const averageSpreadRatio = tickers.reduce((sum, ticker) => {
    const ask = Number(ticker.bestAskPrice);
    const bid = Number(ticker.bestBidPrice);
    const last = Number(ticker.last);
    if (!Number.isFinite(ask) || !Number.isFinite(bid) || !Number.isFinite(last) || last <= 0) {
      return sum;
    }

    return sum + (ask - bid) / last;
  }, 0) / tickers.length;

  if (averageSpreadRatio <= 0.0015) {
    return "range";
  }

  return "unclear";
}

function determinePortfolioState(snapshot: RuntimeSnapshot): RuntimePortfolioState {
  const openPositions = snapshot.portfolio.positions.filter((position) => (Number(position.heldQuantity) || 0) > 0);

  if (openPositions.length === 0) {
    return "flat";
  }

  if (openPositions.length <= 1) {
    return "light";
  }

  const totalPositionValue = openPositions.reduce((sum, position) => sum + (Number(position.positionValueKrw) || 0), 0);
  const availableKrw = Number(snapshot.account.availableKrw) || 0;
  const exposure = availableKrw + totalPositionValue > 0 ? totalPositionValue / (availableKrw + totalPositionValue) : 0;

  if (exposure >= 0.6) {
    return "overexposed";
  }

  return "loaded";
}

function buildCandidateTargets(snapshot: RuntimeSnapshot, portfolioState: RuntimePortfolioState): RuntimeAnalysisCandidate[] {
  return snapshot.portfolio.positions.map((position) => {
    const heldQuantity = Number(position.heldQuantity) || 0;
    const hasTicker = snapshot.market.tickers.some((ticker) => ticker.target === position.target && ticker.last);
    const configured = snapshot.account.configured;

    let bias: RuntimeAnalysisCandidate["bias"] = "hold";
    let confidence = 0.35;
    const notesEn: string[] = [];
    let summaryKo = `${position.target}는 아직 판단을 보류하는 편이 안전합니다.`;

    if (!configured) {
      notesEn.push("Account credentials are unavailable, so no actionable candidate can be trusted.");
    } else if (!hasTicker) {
      notesEn.push("Ticker data is missing for this target, so confidence stays low.");
    } else if (heldQuantity > 0) {
      bias = portfolioState === "overexposed" ? "sell" : "hold";
      confidence = portfolioState === "overexposed" ? 0.6 : 0.45;
      notesEn.push("A live position already exists, so the next action depends on exposure and exit conditions.");
      summaryKo = bias === "sell"
        ? `${position.target}는 보유 비중이 높아 줄여볼 후보입니다.`
        : `${position.target}는 이미 보유 중이라 추가 진입보다 관리가 우선입니다.`;
    } else {
      bias = "buy";
      confidence = snapshot.market.mode === "mock" ? 0.4 : 0.62;
      notesEn.push("No live position is open and current data supports a conservative entry candidate.");
      summaryKo = `${position.target}는 현재 신규 진입 후보로 볼 수 있습니다.`;
    }

    return {
      target: position.target,
      bias,
      confidence,
      notesEn,
      summaryKo
    };
  });
}

function buildRiskNotes(
  snapshot: RuntimeSnapshot,
  portfolioState: RuntimePortfolioState,
  marketRegime: RuntimeAnalysis["marketRegime"]
): string[] {
  const risks: string[] = [];

  if (!snapshot.account.configured) {
    risks.push("Coinone credentials are missing, so account-aware risk checks are incomplete.");
  }

  if (snapshot.market.mode === "mock") {
    risks.push("Market data is mocked, so execution candidates should remain conservative.");
  }

  if (portfolioState === "overexposed") {
    risks.push("Portfolio exposure already looks elevated relative to available cash.");
  }

  if (marketRegime === "unclear") {
    risks.push("Market regime is unclear from the latest snapshot.");
  }

  return risks;
}

function buildEnglishSummary(
  snapshot: RuntimeSnapshot,
  marketRegime: RuntimeAnalysis["marketRegime"],
  portfolioState: RuntimePortfolioState,
  candidateTargets: RuntimeAnalysisCandidate[],
  risks: string[]
): string {
  const candidateSummary = candidateTargets.length > 0
    ? candidateTargets.map((candidate) => `${candidate.target}:${candidate.bias}`).join(", ")
    : "no candidates";

  return [
    `Market regime=${marketRegime}.`,
    `Portfolio state=${portfolioState}.`,
    `Candidates=${candidateSummary}.`,
    risks.length > 0 ? `Risks=${risks.join(" ")}` : "No material runtime risks flagged."
  ].join(" ");
}

function buildKoreanSummary(
  snapshot: RuntimeSnapshot,
  marketRegime: RuntimeAnalysis["marketRegime"],
  portfolioState: RuntimePortfolioState,
  candidateTargets: RuntimeAnalysisCandidate[]
): string {
  const buyCandidates = candidateTargets.filter((candidate) => candidate.bias === "buy").map((candidate) => candidate.target);

  if (!snapshot.account.configured) {
    return "계좌 인증 정보를 읽지 못해 이번 분석은 보수적으로 유지했습니다.";
  }

  if (buyCandidates.length > 0) {
    return `${buyCandidates.join(", ")}는 현재 신규 진입 후보로 볼 수 있습니다. 시장 상태는 ${localizeMarketRegime(marketRegime)}, 포트폴리오 상태는 ${localizePortfolioState(portfolioState)}입니다.`;
  }

  return `이번 분석에서는 뚜렷한 신규 진입 후보보다 ${localizePortfolioState(portfolioState)} 상태 점검이 더 중요합니다.`;
}

function localizeMarketRegime(regime: RuntimeAnalysis["marketRegime"]): string {
  switch (regime) {
    case "range":
      return "횡보장";
    case "trend-up":
      return "상승 추세";
    case "trend-down":
      return "하락 추세";
    default:
      return "판단 보류";
  }
}

function localizePortfolioState(state: RuntimePortfolioState): string {
  switch (state) {
    case "flat":
      return "무포지션";
    case "light":
      return "가벼운 보유";
    case "loaded":
      return "보유 확대 상태";
    case "overexposed":
      return "보유 비중이 높은 상태";
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
