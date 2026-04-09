import type { AppConfig } from "../config/env.js";
import { CoinoneCliAdapter } from "../adapters/coinone-cli.js";
import { CoinoneLiveOrderAdapter } from "./coinone-live-adapter.js";
import { normalizeOrderForMarket } from "./market-normalization.js";
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
  const preparedEntries = await prepareSubmitEntries(config, preview);
  const gates = buildSubmitGates(config, preview, approval, createdAt, preparedEntries);
  const blockReasons = gates.filter((gate) => gate.status === "fail").map((gate) => `${gate.name}: ${gate.detail}`);
  const adapter = config.submitAdapter;
  const submittedEntries = await buildSubmitEntries(config, preview, preparedEntries, blockReasons.length === 0 ? "submitted" : "blocked", createdAt);
  const liveSubmitFailures = submittedEntries.filter((entry) => entry.status !== "submitted").map((entry) => entry.reason);
  const finalStatus = blockReasons.length === 0 && liveSubmitFailures.length === 0 ? "submitted" : "blocked";
  const submit = validateExecutionSubmitArtifact({
    schemaVersion: "1",
    submitId: buildExecutionRunId("execution-submit", createdAt),
    previewId: preview.previewId,
    approvalId: approval?.approvalId,
    createdAt,
    workflow: "execution-submit",
    adapter,
    finalStatus,
    dryRun: config.dryRun,
    liveTradingEnabled: config.enableLiveTrading,
    liveTradingBlocked: !config.enableLiveTrading || config.tradingKillSwitch,
    gates,
    blockReasons: [...blockReasons, ...liveSubmitFailures],
    submittedEntries,
    summary: buildKoreanSubmitSummary(preview.previewId, finalStatus, blockReasons.length + liveSubmitFailures.length, adapter),
    notes: [
      "execution:submit validates preview/approval binding before any submit adapter is called.",
      adapter === "mock"
        ? "Current adapter is mock-only and intentionally never places a live order."
        : "Coinone live adapter can place a real order after all submit gates pass.",
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
  config: AppConfig,
  preview: ExecutionPreviewArtifact,
  approval: ExecutionApprovalArtifact | undefined,
  createdAt: string,
  preparedEntries: PreparedSubmitEntry[]
): ExecutionSubmitGateResult[] {
  const hasSubmittableEntry = preparedEntries.some((entry) => entry.submittable);
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
      name: "market-constraints",
      status: hasSubmittableEntry ? "pass" : "fail",
      detail: hasSubmittableEntry
        ? "Market metadata accepted the normalized limit-order payload."
        : preparedEntries.find((entry) => entry.failureReason)?.failureReason ?? "No normalized order payload passed market constraints."
    },
    {
      name: "submit-adapter-selected",
      status: config.submitAdapter === "mock" || config.submitAdapter === "coinone-live" ? "pass" : "fail",
      detail: `Submit adapter=${config.submitAdapter}.`
    },
    {
      name: "live-enabled",
      status: config.submitAdapter === "mock" || config.enableLiveTrading ? "pass" : "fail",
      detail: config.submitAdapter === "mock"
        ? "Mock adapter does not require ENABLE_LIVE_TRADING."
        : config.enableLiveTrading
          ? "ENABLE_LIVE_TRADING=true."
          : "ENABLE_LIVE_TRADING=false."
    },
    {
      name: "dry-run-disabled",
      status: config.submitAdapter === "mock" || !config.dryRun ? "pass" : "fail",
      detail: config.submitAdapter === "mock"
        ? "Mock adapter ignores DRY_RUN for audit simulation."
        : config.dryRun
          ? "DRY_RUN=true."
          : "DRY_RUN=false."
    },
    {
      name: "kill-switch-off",
      status: config.submitAdapter === "mock" || !config.tradingKillSwitch ? "pass" : "fail",
      detail: config.submitAdapter === "mock"
        ? "Mock adapter ignores TRADING_KILL_SWITCH for audit simulation."
        : config.tradingKillSwitch
          ? "TRADING_KILL_SWITCH=true."
          : "TRADING_KILL_SWITCH=false."
    }
  ];
}

async function buildSubmitEntries(
  config: AppConfig,
  preview: ExecutionPreviewArtifact,
  preparedEntries: PreparedSubmitEntry[],
  finalStatus: ExecutionSubmitArtifact["finalStatus"],
  createdAt: string
): Promise<ExecutionSubmitEntry[]> {
  const liveAdapter = config.submitAdapter === "coinone-live"
    ? new CoinoneLiveOrderAdapter(config)
    : undefined;

  const entries = await Promise.all(preparedEntries.map<Promise<ExecutionSubmitEntry | undefined>>(async (prepared) => {
      const { entry, index } = prepared;
      if (entry.action === "hold") {
        return undefined;
      }

      const submittable = prepared.submittable;

      if (finalStatus === "submitted" && submittable) {
        if (config.submitAdapter === "coinone-live" && liveAdapter && prepared.normalizedOrder) {
          const liveResult = await liveAdapter.submitLimitOrder(prepared.normalizedOrder);
          return {
            target: entry.target,
            action: entry.action,
            previewEntryIndex: index,
            status: liveResult.submitted ? "submitted" : "skipped",
            reason: liveResult.submitted
              ? "Coinone live adapter submitted the approved preview payload."
              : `Coinone live adapter blocked or failed submission: ${liveResult.failureReason ?? "unknown reason"}`,
            orderPayload: prepared.normalizedOrder,
            liveSubmission: {
              adapter: "coinone-live",
              orderId: liveResult.orderId,
              submittedAt: liveResult.submittedAt,
              rawResponse: liveResult.rawResponse
            }
          };
        }

        return {
          target: entry.target,
          action: entry.action,
          previewEntryIndex: index,
          status: "submitted",
          reason: "Mock adapter accepted the approved preview payload.",
          orderPayload: prepared.normalizedOrder,
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
          ? prepared.failureReason ?? "Entry stayed out of submission because its preview payload or market constraints were incomplete."
          : "Final safety gates failed before any mock submission could run.",
        orderPayload: prepared.normalizedOrder ?? entry.wouldSubmitOrder
      };
    }));

  return entries.filter((entry): entry is ExecutionSubmitEntry => entry !== undefined);
}

interface PreparedSubmitEntry {
  entry: ExecutionPreviewArtifact["entries"][number];
  index: number;
  normalizedOrder?: ExecutionPreviewArtifact["entries"][number]["wouldSubmitOrder"];
  submittable: boolean;
  failureReason?: string;
}

async function prepareSubmitEntries(config: AppConfig, preview: ExecutionPreviewArtifact): Promise<PreparedSubmitEntry[]> {
  const actionableEntries = preview.entries.filter((entry) => entry.action !== "hold" && !!entry.wouldSubmitOrder);
  if (actionableEntries.length === 0) {
    return preview.entries.map((entry, index) => ({ entry, index, submittable: false, failureReason: "No actionable preview entry." }));
  }

  const markets = await new CoinoneCliAdapter(config).listMarkets(preview.quoteCurrency);

  return preview.entries.map((entry, index) => {
    if (entry.action === "hold" || !entry.wouldSubmitOrder) {
      return { entry, index, submittable: false, failureReason: "Hold entries are not submittable." };
    }

    if (!entry.validation.executableCandidate || !entry.validation.orderPayloadReady) {
      return { entry, index, submittable: false, failureReason: "Preview gates did not produce an executable candidate." };
    }

    const [target, quote] = entry.wouldSubmitOrder.pair.split("/");
    const market = markets.find((candidate) => candidate.target === target && candidate.quote === quote);
    const normalized = normalizeOrderForMarket(entry.wouldSubmitOrder, market);

    return {
      entry,
      index,
      normalizedOrder: normalized.normalizedOrder,
      submittable: !!normalized.normalizedOrder,
      failureReason: normalized.failureReason
    };
  });
}

function buildKoreanSubmitSummary(
  previewId: string,
  finalStatus: ExecutionSubmitArtifact["finalStatus"],
  blockedGateCount: number,
  adapter: ExecutionSubmitArtifact["adapter"]
): ExecutionSubmitArtifact["summary"] {
  if (finalStatus === "submitted") {
    return {
      locale: "ko-KR",
      headline: "실행 제출 기록",
      summary: adapter === "coinone-live"
        ? `${previewId} 미리보기를 승인 검증 후 실제 Coinone 주문으로 전송했습니다.`
        : `${previewId} 미리보기를 승인 검증 후 모의 제출로 기록했습니다. 실제 Coinone 주문은 전송하지 않았습니다.`
    };
  }

  return {
    locale: "ko-KR",
    headline: "실행 제출 차단",
    summary: `${previewId} 미리보기 제출을 차단했습니다. 안전 게이트 ${blockedGateCount}건이 실패했고 실제 주문은 전송하지 않았습니다.`
  };
}
