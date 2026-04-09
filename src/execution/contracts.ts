export type PreviewGateName = "payload" | "allowlist" | "max-order" | "min-reserve" | "live-flag" | "kill-switch" | "dry-run-policy";
export type PreviewGateStatus = "pass" | "fail" | "not-applicable";
export type PreviewFinalStatus = "blocked" | "skipped";
export type ApprovalStatus = "approved" | "expired";
export type SubmitGateName =
  | "preview-schema"
  | "approval-present"
  | "approval-preview-match"
  | "approval-not-expired"
  | "preview-has-submittable-entry"
  | "market-constraints"
  | "submit-adapter-selected"
  | "live-enabled"
  | "dry-run-disabled"
  | "kill-switch-off";
export type SubmitGateStatus = "pass" | "fail";
export type SubmitFinalStatus = "submitted" | "blocked";

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

export interface ExecutionApprovalArtifact {
  schemaVersion: "1";
  approvalId: string;
  previewId: string;
  previewCreatedAt: string;
  createdAt: string;
  expiresAt: string;
  status: ApprovalStatus;
  workflow: "execution-approve";
  approvalWindowSeconds: number;
  summary: {
    locale: "ko-KR";
    headline: string;
    summary: string;
  };
  notes: string[];
}

export interface ExecutionSubmitGateResult {
  name: SubmitGateName;
  status: SubmitGateStatus;
  detail: string;
}

export interface ExecutionSubmitEntry {
  target: string;
  action: "buy" | "sell";
  previewEntryIndex: number;
  status: "submitted" | "skipped";
  reason: string;
  orderPayload?: ExecutionPreviewOrderPayload;
  mockSubmission?: {
    adapter: "mock";
    mockOrderId: string;
    submittedAt: string;
  };
  liveSubmission?: {
    adapter: "coinone-live";
    orderId?: string | null;
    submittedAt?: string | null;
    rawResponse: unknown;
  };
}

export interface ExecutionSubmitArtifact {
  schemaVersion: "1";
  submitId: string;
  previewId: string;
  approvalId?: string;
  createdAt: string;
  workflow: "execution-submit";
  adapter: "mock" | "coinone-live";
  finalStatus: SubmitFinalStatus;
  dryRun: boolean;
  liveTradingEnabled: boolean;
  liveTradingBlocked: boolean;
  gates: ExecutionSubmitGateResult[];
  blockReasons: string[];
  submittedEntries: ExecutionSubmitEntry[];
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

export function validateExecutionApprovalArtifact(value: unknown): ExecutionApprovalArtifact {
  const artifact = expectRecord(value, "approval");

  expectLiteral(artifact.schemaVersion, "1", "approval.schemaVersion");
  expectString(artifact.approvalId, "approval.approvalId");
  expectString(artifact.previewId, "approval.previewId");
  expectString(artifact.previewCreatedAt, "approval.previewCreatedAt");
  expectString(artifact.createdAt, "approval.createdAt");
  expectString(artifact.expiresAt, "approval.expiresAt");
  expectEnum(artifact.status, ["approved", "expired"], "approval.status");
  expectLiteral(artifact.workflow, "execution-approve", "approval.workflow");
  expectNumber(artifact.approvalWindowSeconds, "approval.approvalWindowSeconds");

  const summary = expectRecord(artifact.summary, "approval.summary");
  expectLiteral(summary.locale, "ko-KR", "approval.summary.locale");
  expectString(summary.headline, "approval.summary.headline");
  expectString(summary.summary, "approval.summary.summary");
  expectStringArray(artifact.notes, "approval.notes");

  return artifact as unknown as ExecutionApprovalArtifact;
}

export function validateExecutionSubmitArtifact(value: unknown): ExecutionSubmitArtifact {
  const artifact = expectRecord(value, "submit");

  expectLiteral(artifact.schemaVersion, "1", "submit.schemaVersion");
  expectString(artifact.submitId, "submit.submitId");
  expectString(artifact.previewId, "submit.previewId");

  if (artifact.approvalId !== undefined) {
    expectString(artifact.approvalId, "submit.approvalId");
  }

  expectString(artifact.createdAt, "submit.createdAt");
  expectLiteral(artifact.workflow, "execution-submit", "submit.workflow");
  expectEnum(artifact.adapter, ["mock", "coinone-live"], "submit.adapter");
  expectEnum(artifact.finalStatus, ["submitted", "blocked"], "submit.finalStatus");
  expectBoolean(artifact.dryRun, "submit.dryRun");
  expectBoolean(artifact.liveTradingEnabled, "submit.liveTradingEnabled");
  expectBoolean(artifact.liveTradingBlocked, "submit.liveTradingBlocked");

  expectArray(artifact.gates, "submit.gates").forEach((gate, index) => {
    const record = expectRecord(gate, `submit.gates[${index}]`);
    expectEnum(
      record.name,
      [
        "preview-schema",
        "approval-present",
          "approval-preview-match",
          "approval-not-expired",
          "preview-has-submittable-entry",
          "market-constraints",
          "submit-adapter-selected",
          "live-enabled",
          "dry-run-disabled",
          "kill-switch-off"
        ],
      `submit.gates[${index}].name`
    );
    expectEnum(record.status, ["pass", "fail"], `submit.gates[${index}].status`);
    expectString(record.detail, `submit.gates[${index}].detail`);
  });
  expectStringArray(artifact.blockReasons, "submit.blockReasons");

  expectArray(artifact.submittedEntries, "submit.submittedEntries").forEach((entry, index) => {
    const record = expectRecord(entry, `submit.submittedEntries[${index}]`);
    expectString(record.target, `submit.submittedEntries[${index}].target`);
    expectEnum(record.action, ["buy", "sell"], `submit.submittedEntries[${index}].action`);
    expectNumber(record.previewEntryIndex, `submit.submittedEntries[${index}].previewEntryIndex`);
    expectEnum(record.status, ["submitted", "skipped"], `submit.submittedEntries[${index}].status`);
    expectString(record.reason, `submit.submittedEntries[${index}].reason`);

    if (record.orderPayload !== undefined) {
      validateOrderPayload(record.orderPayload, `submit.submittedEntries[${index}].orderPayload`);
    }

    if (record.mockSubmission !== undefined) {
      const mockSubmission = expectRecord(record.mockSubmission, `submit.submittedEntries[${index}].mockSubmission`);
      expectLiteral(mockSubmission.adapter, "mock", `submit.submittedEntries[${index}].mockSubmission.adapter`);
      expectString(mockSubmission.mockOrderId, `submit.submittedEntries[${index}].mockSubmission.mockOrderId`);
      expectString(mockSubmission.submittedAt, `submit.submittedEntries[${index}].mockSubmission.submittedAt`);
    }

    if (record.liveSubmission !== undefined) {
      const liveSubmission = expectRecord(record.liveSubmission, `submit.submittedEntries[${index}].liveSubmission`);
      expectLiteral(liveSubmission.adapter, "coinone-live", `submit.submittedEntries[${index}].liveSubmission.adapter`);
      if (liveSubmission.orderId !== undefined && liveSubmission.orderId !== null) {
        expectString(liveSubmission.orderId, `submit.submittedEntries[${index}].liveSubmission.orderId`);
      }
      if (liveSubmission.submittedAt !== undefined && liveSubmission.submittedAt !== null) {
        expectString(liveSubmission.submittedAt, `submit.submittedEntries[${index}].liveSubmission.submittedAt`);
      }
      if (liveSubmission.rawResponse === undefined) {
        throw new Error(`submit.submittedEntries[${index}].liveSubmission.rawResponse must be present.`);
      }
    }
  });

  const summary = expectRecord(artifact.summary, "submit.summary");
  expectLiteral(summary.locale, "ko-KR", "submit.summary.locale");
  expectString(summary.headline, "submit.summary.headline");
  expectString(summary.summary, "submit.summary.summary");
  expectStringArray(artifact.notes, "submit.notes");

  return artifact as unknown as ExecutionSubmitArtifact;
}

function validateEntry(value: unknown, index: number): void {
  const entry = expectRecord(value, `preview.entries[${index}]`);
  expectString(entry.target, `preview.entries[${index}].target`);
  expectEnum(entry.action, ["buy", "sell", "hold"], `preview.entries[${index}].action`);
  expectEnum(entry.profileUsed, ["default", "stablecoin"], `preview.entries[${index}].profileUsed`);
  expectString(entry.reason, `preview.entries[${index}].reason`);

  if (entry.wouldSubmitOrder !== undefined) {
    validateOrderPayload(entry.wouldSubmitOrder, `preview.entries[${index}].wouldSubmitOrder`);
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

function validateOrderPayload(value: unknown, label: string): void {
  const order = expectRecord(value, label);
  expectEnum(order.side, ["BUY", "SELL"], `${label}.side`);
  expectLiteral(order.type, "limit", `${label}.type`);
  expectString(order.pair, `${label}.pair`);
  expectString(order.price, `${label}.price`);
  expectString(order.quantity, `${label}.quantity`);
  expectString(order.value, `${label}.value`);
  expectString(order.quoteCurrency, `${label}.quoteCurrency`);
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
