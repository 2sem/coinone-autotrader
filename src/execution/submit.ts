import type { AppConfig } from "../config/env.js";
import {
  validateExecutionSubmitArtifact,
  type ExecutionApprovalArtifact,
  type ExecutionPreviewArtifact,
  type ExecutionSubmitArtifact,
  type ExecutionSubmitEntry,
  type ExecutionSubmitGateResult
} from "./contracts.js";
import { buildExecutionRunId, persistExecutionArtifact, readExecutionApprovalArtifact, readExecutionPreviewArtifact } from "./storage.js";

export interface ExecutionSubmitRunOptions {
  previewId?: string;
  approvalId?: string;
}

export interface ExecutionSubmitRunResult {
  workflow: "execution-submit";
  preview: ExecutionPreviewArtifact;
  approval?: ExecutionApprovalArtifact;
  submit: ExecutionSubmitArtifact;
  output: {
    latestPath: string;
    datedPath: string;
  };
}

export async function runExecutionSubmit(
  config: AppConfig,
  options: ExecutionSubmitRunOptions = {}
): Promise<ExecutionSubmitRunResult> {
  const preview = await readExecutionPreviewArtifact(config.executionPreviewOutputDir, options.previewId);
  const approval = await readExecutionApprovalArtifact(config.executionPreviewOutputDir, options.approvalId);
  const createdAt = new Date().toISOString();
  const gates = buildSubmitGates(preview, approval, createdAt);
  const blockReasons = gates.filter((gate) => gate.status === "fail").map((gate) => `${gate.name}: ${gate.detail}`);
  const finalStatus = blockReasons.length === 0 ? "submitted" : "blocked";
  const submit = validateExecutionSubmitArtifact({
    schemaVersion: "1",
    submitId: buildExecutionRunId("execution-submit", createdAt),
    previewId: preview.previewId,
    approvalId: approval?.approvalId,
    createdAt,
    workflow: "execution-submit",
    adapter: "mock",
    finalStatus,
    dryRun: config.dryRun,
    liveTradingEnabled: config.enableLiveTrading,
    liveTradingBlocked: !config.enableLiveTrading || config.tradingKillSwitch,
    gates,
    blockReasons,
    submittedEntries: buildSubmitEntries(preview, finalStatus, createdAt),
    summary: buildKoreanSubmitSummary(preview.previewId, finalStatus, blockReasons.length),
    notes: [
      "execution:submit validates preview/approval binding before any submit adapter is called.",
      "Current adapter is mock-only and intentionally never places a live order.",
      "Blocked submit attempts still persist artifacts for auditability."
    ]
  });
  const output = await persistExecutionArtifact(config.executionPreviewOutputDir, "submits", submit.createdAt, submit);

  return {
    workflow: "execution-submit",
    preview,
    approval,
    submit,
    output
  };
}

function buildSubmitGates(
  preview: ExecutionPreviewArtifact,
  approval: ExecutionApprovalArtifact | undefined,
  createdAt: string
): ExecutionSubmitGateResult[] {
  const hasSubmittableEntry = preview.entries.some(
    (entry) => entry.action !== "hold" && entry.validation.executableCandidate && entry.validation.orderPayloadReady && !!entry.wouldSubmitOrder
  );
  const approvalMatchesPreview = approval?.previewId === preview.previewId;
  const approvalNotExpired = approval !== undefined
    && approval.status === "approved"
    && Date.parse(approval.expiresAt) > Date.parse(createdAt);

  return [
    {
      name: "preview-schema",
      status: "pass",
      detail: "Preview artifact passed schema validation before submit gates ran."
    },
    {
      name: "approval-present",
      status: approval ? "pass" : "fail",
      detail: approval
        ? `Approval artifact ${approval.approvalId} is present.`
        : "No approval artifact is available for this submit attempt."
    },
    {
      name: "approval-preview-match",
      status: approvalMatchesPreview ? "pass" : "fail",
      detail: approval
        ? approvalMatchesPreview
          ? "Approval previewId matches the submit previewId."
          : `Approval previewId ${approval.previewId} does not match previewId ${preview.previewId}.`
        : "Preview match cannot be verified because approval is missing."
    },
    {
      name: "approval-not-expired",
      status: approvalNotExpired ? "pass" : "fail",
      detail: approval
        ? approvalNotExpired
          ? `Approval remains valid until ${approval.expiresAt}.`
          : `Approval expired at ${approval.expiresAt} or is no longer active.`
        : "Approval expiry cannot be verified because approval is missing."
    },
    {
      name: "preview-has-submittable-entry",
      status: hasSubmittableEntry ? "pass" : "fail",
      detail: hasSubmittableEntry
        ? "Preview contains at least one non-hold entry with a complete payload and passing non-live gates."
        : "Preview does not contain any entry eligible for mock submission."
    },
    {
      name: "mock-adapter-only",
      status: "pass",
      detail: "Mock submit adapter selected; no live order API call will be made."
    }
  ];
}

function buildSubmitEntries(
  preview: ExecutionPreviewArtifact,
  finalStatus: ExecutionSubmitArtifact["finalStatus"],
  createdAt: string
): ExecutionSubmitEntry[] {
  return preview.entries
    .map<ExecutionSubmitEntry | undefined>((entry, index) => {
      if (entry.action === "hold") {
        return undefined;
      }

      const submittable = entry.validation.executableCandidate && entry.validation.orderPayloadReady && !!entry.wouldSubmitOrder;

      if (finalStatus === "submitted" && submittable) {
        return {
          target: entry.target,
          action: entry.action,
          previewEntryIndex: index,
          status: "submitted",
          reason: "Mock adapter accepted the approved preview payload.",
          orderPayload: entry.wouldSubmitOrder,
          mockSubmission: {
            adapter: "mock",
            mockOrderId: buildExecutionRunId(`mock-order-${entry.target.toLowerCase()}`, createdAt),
            submittedAt: createdAt
          }
        };
      }

      return {
        target: entry.target,
        action: entry.action,
        previewEntryIndex: index,
        status: "skipped",
        reason: finalStatus === "submitted"
          ? "Entry stayed out of mock submission because its preview payload or safety gates were incomplete."
          : "Final safety gates failed before any mock submission could run.",
        orderPayload: entry.wouldSubmitOrder
      };
    })
    .filter((entry): entry is ExecutionSubmitEntry => entry !== undefined);
}

function buildKoreanSubmitSummary(
  previewId: string,
  finalStatus: ExecutionSubmitArtifact["finalStatus"],
  blockedGateCount: number
): ExecutionSubmitArtifact["summary"] {
  if (finalStatus === "submitted") {
    return {
      locale: "ko-KR",
      headline: "실행 제출 기록",
      summary: `${previewId} 미리보기를 승인 검증 후 모의 제출로 기록했습니다. 실제 Coinone 주문은 전송하지 않았습니다.`
    };
  }

  return {
    locale: "ko-KR",
    headline: "실행 제출 차단",
    summary: `${previewId} 미리보기 제출을 차단했습니다. 안전 게이트 ${blockedGateCount}건이 실패했고 실제 주문은 전송하지 않았습니다.`
  };
}
