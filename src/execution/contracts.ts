export type PreviewGateName = "payload" | "allowlist" | "max-order" | "min-reserve" | "live-flag" | "kill-switch" | "dry-run-policy";
export type PreviewGateStatus = "pass" | "fail" | "not-applicable";
export type PreviewFinalStatus = "blocked" | "skipped";

export interface ExecutionPreviewOrderPayload {
  side: "BUY" | "SELL";
  type: "limit";
  pair: string;
  price: string;
  quantity: string;
  value: string;
  quoteCurrency: string;
}

export interface ExecutionPreviewGateResult {
  name: PreviewGateName;
  status: PreviewGateStatus;
  detail: string;
}

export interface ExecutionPreviewValidation {
  finalStatus: PreviewFinalStatus;
  executableCandidate: boolean;
  orderPayloadReady: boolean;
  submissionBlocked: true;
  gates: ExecutionPreviewGateResult[];
  blockReasons: string[];
}

export interface ExecutionPreviewEntry {
  target: string;
  action: "buy" | "sell" | "hold";
  profileUsed: "default" | "stablecoin";
  reason: string;
  wouldSubmitOrder?: ExecutionPreviewOrderPayload;
  validation: ExecutionPreviewValidation;
  userFacing: {
    locale: "ko-KR";
    headline: string;
    summary: string;
  };
}

export interface ExecutionPreviewArtifact {
  schemaVersion: "1";
  previewId: string;
  createdAt: string;
  workflow: "execution-preview";
  dryRun: boolean;
  liveTradingEnabled: boolean;
  liveTradingBlocked: boolean;
  marketDataMode: "auto" | "live" | "mock";
  marketDataSource: "live-cli" | "mock";
  selectionMode: "allowlist" | "auto";
  selectedTargets: string[];
  quoteCurrency: string;
  riskControls: {
    maxOrderKrw: number;
    minCashReserveKrw: number;
  };
  entries: ExecutionPreviewEntry[];
  summary: {
    locale: "ko-KR";
    headline: string;
    summary: string;
  };
  notes: string[];
}

export function validateExecutionPreviewArtifact(value: unknown): ExecutionPreviewArtifact {
  const artifact = expectRecord(value, "preview");

  expectLiteral(artifact.schemaVersion, "1", "preview.schemaVersion");
  expectString(artifact.previewId, "preview.previewId");
  expectString(artifact.createdAt, "preview.createdAt");
  expectLiteral(artifact.workflow, "execution-preview", "preview.workflow");
  expectBoolean(artifact.dryRun, "preview.dryRun");
  expectBoolean(artifact.liveTradingEnabled, "preview.liveTradingEnabled");
  expectBoolean(artifact.liveTradingBlocked, "preview.liveTradingBlocked");
  expectEnum(artifact.marketDataMode, ["auto", "live", "mock"], "preview.marketDataMode");
  expectEnum(artifact.marketDataSource, ["live-cli", "mock"], "preview.marketDataSource");
  expectEnum(artifact.selectionMode, ["allowlist", "auto"], "preview.selectionMode");
  expectStringArray(artifact.selectedTargets, "preview.selectedTargets");
  expectString(artifact.quoteCurrency, "preview.quoteCurrency");

  const riskControls = expectRecord(artifact.riskControls, "preview.riskControls");
  expectNumber(riskControls.maxOrderKrw, "preview.riskControls.maxOrderKrw");
  expectNumber(riskControls.minCashReserveKrw, "preview.riskControls.minCashReserveKrw");

  expectArray(artifact.entries, "preview.entries").forEach((entry, index) => validateEntry(entry, index));

  const summary = expectRecord(artifact.summary, "preview.summary");
  expectLiteral(summary.locale, "ko-KR", "preview.summary.locale");
  expectString(summary.headline, "preview.summary.headline");
  expectString(summary.summary, "preview.summary.summary");
  expectStringArray(artifact.notes, "preview.notes");

  return artifact as unknown as ExecutionPreviewArtifact;
}

function validateEntry(value: unknown, index: number): void {
  const entry = expectRecord(value, `preview.entries[${index}]`);
  expectString(entry.target, `preview.entries[${index}].target`);
  expectEnum(entry.action, ["buy", "sell", "hold"], `preview.entries[${index}].action`);
  expectEnum(entry.profileUsed, ["default", "stablecoin"], `preview.entries[${index}].profileUsed`);
  expectString(entry.reason, `preview.entries[${index}].reason`);

  if (entry.wouldSubmitOrder !== undefined) {
    const order = expectRecord(entry.wouldSubmitOrder, `preview.entries[${index}].wouldSubmitOrder`);
    expectEnum(order.side, ["BUY", "SELL"], `preview.entries[${index}].wouldSubmitOrder.side`);
    expectLiteral(order.type, "limit", `preview.entries[${index}].wouldSubmitOrder.type`);
    expectString(order.pair, `preview.entries[${index}].wouldSubmitOrder.pair`);
    expectString(order.price, `preview.entries[${index}].wouldSubmitOrder.price`);
    expectString(order.quantity, `preview.entries[${index}].wouldSubmitOrder.quantity`);
    expectString(order.value, `preview.entries[${index}].wouldSubmitOrder.value`);
    expectString(order.quoteCurrency, `preview.entries[${index}].wouldSubmitOrder.quoteCurrency`);
  }

  const validation = expectRecord(entry.validation, `preview.entries[${index}].validation`);
  expectEnum(validation.finalStatus, ["blocked", "skipped"], `preview.entries[${index}].validation.finalStatus`);
  expectBoolean(validation.executableCandidate, `preview.entries[${index}].validation.executableCandidate`);
  expectBoolean(validation.orderPayloadReady, `preview.entries[${index}].validation.orderPayloadReady`);
  expectLiteral(validation.submissionBlocked, true, `preview.entries[${index}].validation.submissionBlocked`);
  expectArray(validation.gates, `preview.entries[${index}].validation.gates`).forEach((gate, gateIndex) => {
    const gateRecord = expectRecord(gate, `preview.entries[${index}].validation.gates[${gateIndex}]`);
    expectEnum(
      gateRecord.name,
      ["payload", "allowlist", "max-order", "min-reserve", "live-flag", "kill-switch", "dry-run-policy"],
      `preview.entries[${index}].validation.gates[${gateIndex}].name`
    );
    expectEnum(
      gateRecord.status,
      ["pass", "fail", "not-applicable"],
      `preview.entries[${index}].validation.gates[${gateIndex}].status`
    );
    expectString(gateRecord.detail, `preview.entries[${index}].validation.gates[${gateIndex}].detail`);
  });
  expectStringArray(validation.blockReasons, `preview.entries[${index}].validation.blockReasons`);

  const userFacing = expectRecord(entry.userFacing, `preview.entries[${index}].userFacing`);
  expectLiteral(userFacing.locale, "ko-KR", `preview.entries[${index}].userFacing.locale`);
  expectString(userFacing.headline, `preview.entries[${index}].userFacing.headline`);
  expectString(userFacing.summary, `preview.entries[${index}].userFacing.summary`);
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

function expectStringArray(value: unknown, label: string): string[] {
  return expectArray(value, label).map((entry, index) => expectString(entry, `${label}[${index}]`));
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function expectEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of ${allowed.join(", ")}.`);
  }

  return value as T;
}

function expectLiteral<T extends string | boolean>(value: unknown, expected: T, label: string): T {
  if (value !== expected) {
    throw new Error(`${label} must be ${String(expected)}.`);
  }

  return expected;
}
