export type RuntimeMarketRegime = "range" | "trend-up" | "trend-down" | "unclear";
export type RuntimePortfolioState = "flat" | "light" | "loaded" | "overexposed";
export type RuntimeCandidateBias = "buy" | "sell" | "hold";

export interface RuntimeAnalysisCandidate {
  target: string;
  bias: RuntimeCandidateBias;
  confidence: number;
  notesEn: string[];
  summaryKo: string;
}

export interface RuntimeAnalysis {
  schemaVersion: "1";
  analysisId: string;
  snapshotId: string;
  createdAt: string;
  marketRegime: RuntimeMarketRegime;
  portfolioState: RuntimePortfolioState;
  candidateTargets: RuntimeAnalysisCandidate[];
  risks: string[];
  analysisSummaryEn: string;
  userSummaryKo: string;
}

export function validateRuntimeAnalysis(value: unknown): RuntimeAnalysis {
  const analysis = expectRecord(value, "analysis");

  expectLiteral(analysis.schemaVersion, "1", "analysis.schemaVersion");
  expectString(analysis.analysisId, "analysis.analysisId");
  expectString(analysis.snapshotId, "analysis.snapshotId");
  expectString(analysis.createdAt, "analysis.createdAt");
  expectEnum(analysis.marketRegime, ["range", "trend-up", "trend-down", "unclear"], "analysis.marketRegime");
  expectEnum(analysis.portfolioState, ["flat", "light", "loaded", "overexposed"], "analysis.portfolioState");
  expectArray(analysis.candidateTargets, "analysis.candidateTargets").forEach((entry, index) => validateCandidate(entry, index));
  expectStringArray(analysis.risks, "analysis.risks");
  expectString(analysis.analysisSummaryEn, "analysis.analysisSummaryEn");
  expectString(analysis.userSummaryKo, "analysis.userSummaryKo");

  return analysis as unknown as RuntimeAnalysis;
}

function validateCandidate(value: unknown, index: number): void {
  const candidate = expectRecord(value, `analysis.candidateTargets[${index}]`);
  expectString(candidate.target, `analysis.candidateTargets[${index}].target`);
  expectEnum(candidate.bias, ["buy", "sell", "hold"], `analysis.candidateTargets[${index}].bias`);
  expectConfidence(candidate.confidence, `analysis.candidateTargets[${index}].confidence`);
  expectStringArray(candidate.notesEn, `analysis.candidateTargets[${index}].notesEn`);
  expectString(candidate.summaryKo, `analysis.candidateTargets[${index}].summaryKo`);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value;
}

function expectStringArray(value: unknown, label: string): string[] {
  return expectArray(value, label).map((entry, index) => expectString(entry, `${label}[${index}]`));
}

function expectEnum<T extends string>(value: unknown, expected: T[], label: string): T {
  if (typeof value !== "string" || !expected.includes(value as T)) {
    throw new Error(`${label} must be one of ${expected.join(", ")}.`);
  }

  return value as T;
}

function expectLiteral<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }

  return expected;
}

function expectConfidence(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a number between 0 and 1.`);
  }

  return value;
}
