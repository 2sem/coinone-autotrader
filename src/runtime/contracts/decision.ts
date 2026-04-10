export type RuntimeDecisionAction = "buy" | "sell" | "hold";
export type RuntimeExecutionPlanMode = "single" | "ladder" | "none";

export interface RuntimeDecisionPlanEntry {
  priceOffsetPct: number;
  valueKrw: number;
}

export interface RuntimeDecisionPlanExit {
  priceOffsetPct: number;
  sellFraction: number;
}

export interface RuntimeDecision {
  schemaVersion: "1";
  decisionId: string;
  snapshotId: string;
  analysisId: string;
  createdAt: string;
  action: RuntimeDecisionAction;
  target?: string;
  confidence: number;
  strategyPreset: "zero-fee-grid" | "low-fee-balance" | "standard-net-profit";
  estimatedMakerFeeBps?: number;
  estimatedTakerFeeBps?: number;
  thesis: string;
  reasoningEn: string;
  userSummaryKo: string;
  riskNotes: string[];
  executionPlan: {
    mode: RuntimeExecutionPlanMode;
    totalOrderValueKrw?: number;
    splitCount?: number;
    entries?: RuntimeDecisionPlanEntry[];
    exits?: RuntimeDecisionPlanExit[];
  };
}

export function validateRuntimeDecision(value: unknown): RuntimeDecision {
  const decision = expectRecord(value, "decision");

  expectLiteral(decision.schemaVersion, "1", "decision.schemaVersion");
  expectString(decision.decisionId, "decision.decisionId");
  expectString(decision.snapshotId, "decision.snapshotId");
  expectString(decision.analysisId, "decision.analysisId");
  expectString(decision.createdAt, "decision.createdAt");
  expectEnum(decision.action, ["buy", "sell", "hold"], "decision.action");
  optionalString(decision.target, "decision.target");
  expectConfidence(decision.confidence, "decision.confidence");
  expectEnum(decision.strategyPreset, ["zero-fee-grid", "low-fee-balance", "standard-net-profit"], "decision.strategyPreset");
  optionalNumber(decision.estimatedMakerFeeBps, "decision.estimatedMakerFeeBps", 0);
  optionalNumber(decision.estimatedTakerFeeBps, "decision.estimatedTakerFeeBps", 0);
  const thesis = expectString(decision.thesis, "decision.thesis");
  const reasoningEn = expectString(decision.reasoningEn, "decision.reasoningEn");
  const userSummaryKo = expectString(decision.userSummaryKo, "decision.userSummaryKo");
  rejectPlaceholder(thesis, "decision.thesis");
  rejectPlaceholder(reasoningEn, "decision.reasoningEn");
  rejectPlaceholder(userSummaryKo, "decision.userSummaryKo");
  expectStringArray(decision.riskNotes, "decision.riskNotes");

  const executionPlan = expectRecord(decision.executionPlan, "decision.executionPlan");
  expectEnum(executionPlan.mode, ["single", "ladder", "none"], "decision.executionPlan.mode");
  optionalNumber(executionPlan.totalOrderValueKrw, "decision.executionPlan.totalOrderValueKrw", 0);
  optionalInteger(executionPlan.splitCount, "decision.executionPlan.splitCount", 1);
  optionalPlanEntries(executionPlan.entries, "decision.executionPlan.entries");
  optionalPlanExits(executionPlan.exits, "decision.executionPlan.exits");

  return decision as unknown as RuntimeDecision;
}

function optionalPlanEntries(value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }

  expectArray(value, label).forEach((entry, index) => {
    const item = expectRecord(entry, `${label}[${index}]`);
    expectNumber(item.priceOffsetPct, `${label}[${index}].priceOffsetPct`);
    expectNumber(item.valueKrw, `${label}[${index}].valueKrw`);
  });
}

function optionalPlanExits(value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }

  expectArray(value, label).forEach((entry, index) => {
    const item = expectRecord(entry, `${label}[${index}]`);
    expectNumber(item.priceOffsetPct, `${label}[${index}].priceOffsetPct`);
    expectConfidence(item.sellFraction, `${label}[${index}].sellFraction`);
  });
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectString(value, label);
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

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function optionalNumber(value: unknown, label: string, minValue: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = expectNumber(value, label);
  if (parsed < minValue) {
    throw new Error(`${label} must be greater than or equal to ${minValue}.`);
  }

  return parsed;
}

function optionalInteger(value: unknown, label: string, minValue: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = expectNumber(value, label);
  if (!Number.isInteger(parsed) || parsed < minValue) {
    throw new Error(`${label} must be an integer greater than or equal to ${minValue}.`);
  }

  return parsed;
}

function rejectPlaceholder(value: string, label: string): void {
  const normalized = value.toLowerCase();
  const blocked = ["replace-me", "replace this placeholder", "초안"];
  if (blocked.some((entry) => normalized.includes(entry))) {
    throw new Error(`${label} must not contain placeholder text.`);
  }
}
