import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "../config/env.js";
import type { TradeDecision, TradeOnceResult } from "../trading/trade-once.js";
import { runTradeOnce } from "../trading/trade-once.js";
import { validateExecutionPreviewArtifact, type ExecutionPreviewArtifact, type ExecutionPreviewEntry, type ExecutionPreviewGateResult, type ExecutionPreviewOrderPayload } from "./contracts.js";

export interface ExecutionPreviewRunResult {
  workflow: "execution-preview";
  preview: ExecutionPreviewArtifact;
  trade: TradeOnceResult;
  output: {
    baseDir: string;
    previewLatestPath: string;
    previewDatedPath: string;
  };
}

export async function runExecutionPreview(config: AppConfig): Promise<ExecutionPreviewRunResult> {
  const trade = await runTradeOnce(config);
  const createdAt = new Date().toISOString();
  const preview = validateExecutionPreviewArtifact({
    schemaVersion: "1",
    previewId: buildRunId("execution-preview", createdAt),
    createdAt,
    workflow: "execution-preview",
    dryRun: config.dryRun,
    liveTradingEnabled: config.enableLiveTrading,
    liveTradingBlocked: !config.enableLiveTrading || config.tradingKillSwitch,
    marketDataMode: trade.marketDataMode,
    marketDataSource: trade.marketDataSource,
    selectionMode: trade.selectionMode,
    selectedTargets: trade.selectedTargets,
    quoteCurrency: trade.quoteCurrency,
    riskControls: {
      maxOrderKrw: config.riskControls.maxOrderKrw,
      minCashReserveKrw: config.riskControls.minCashReserveKrw
    },
    entries: trade.decisions.map((decision) => buildPreviewEntry(config, trade, decision)),
    summary: buildKoreanPreviewSummary(trade),
    notes: [
      "Execution preview reuses the existing trade:once decision engine and market/account snapshot.",
      "Preview builds a realistic would-submit order payload but never calls a live order adapter.",
      "Final validation keeps internal gate details in English while Korean summaries stay user-facing."
    ]
  });
  const output = await persistPreviewArtifact(config.executionPreviewOutputDir, preview);

  return {
    workflow: "execution-preview",
    preview,
    trade,
    output
  };
}

function buildPreviewEntry(config: AppConfig, trade: TradeOnceResult, decision: TradeDecision): ExecutionPreviewEntry {
  const wouldSubmitOrder = buildWouldSubmitOrder(trade.quoteCurrency, decision);
  const validation = buildValidation(config, trade, decision, wouldSubmitOrder);

  return {
    target: decision.target,
    action: decision.action,
    profileUsed: decision.profileUsed,
    reason: decision.reason,
    wouldSubmitOrder,
    validation,
    userFacing: {
      locale: "ko-KR",
      headline: `${decision.target} ${localizeAction(decision.action)} 주문 미리보기`,
      summary: buildEntrySummary(decision, validation)
    }
  };
}

function buildWouldSubmitOrder(quoteCurrency: string, decision: TradeDecision): ExecutionPreviewOrderPayload | undefined {
  if (decision.action === "hold") {
    return undefined;
  }

  const price = decision.action === "buy" ? decision.signal.bestAskPrice : decision.signal.bestBidPrice;
  const quantity = decision.recommendedQuantity;
  const value = decision.recommendedOrderValueKrw ?? multiplyDecimals(price, quantity);

  if (!price || !quantity || !value || !decision.signal.pair) {
    return undefined;
  }

  return {
    side: decision.action === "buy" ? "BUY" : "SELL",
    type: "limit",
    pair: decision.signal.pair,
    price,
    quantity,
    value,
    quoteCurrency
  };
}

function buildValidation(
  config: AppConfig,
  trade: TradeOnceResult,
  decision: TradeDecision,
  wouldSubmitOrder: ExecutionPreviewOrderPayload | undefined
): ExecutionPreviewEntry["validation"] {
  if (decision.action === "hold") {
    return {
      finalStatus: "skipped",
      executableCandidate: false,
      orderPayloadReady: false,
      submissionBlocked: true,
      gates: buildSkippedGates(),
      blockReasons: ["Decision action is hold.", "execution:preview never submits live orders."]
    };
  }

  const gates: ExecutionPreviewGateResult[] = [
    buildPayloadGate(wouldSubmitOrder),
    buildAllowlistGate(config, trade, decision.target),
    buildMaxOrderGate(config, wouldSubmitOrder),
    buildMinReserveGate(config, trade, decision.action, wouldSubmitOrder),
    buildLiveFlagGate(config),
    buildKillSwitchGate(config),
    buildDryRunGate(config)
  ];
  const orderPayloadReady = gates[0]?.status === "pass";
  const executableCandidate = gates
    .filter((gate) => !["live-flag", "kill-switch", "dry-run-policy"].includes(gate.name))
    .every((gate) => gate.status === "pass" || gate.status === "not-applicable");
  const blockReasons = gates.filter((gate) => gate.status === "fail").map((gate) => `${gate.name}: ${gate.detail}`);

  blockReasons.push("execution:preview never submits live orders.");

  return {
    finalStatus: "blocked",
    executableCandidate,
    orderPayloadReady,
    submissionBlocked: true,
    gates,
    blockReasons
  };
}

function buildPayloadGate(wouldSubmitOrder: ExecutionPreviewOrderPayload | undefined): ExecutionPreviewGateResult {
  if (!wouldSubmitOrder) {
    return {
      name: "payload",
      status: "fail",
      detail: "Missing pair, price, quantity, or value for the order preview payload."
    };
  }

  return {
    name: "payload",
    status: "pass",
    detail: "Would-submit order payload is complete."
  };
}

function buildAllowlistGate(config: AppConfig, trade: TradeOnceResult, target: string): ExecutionPreviewGateResult {
  const selected = trade.selectedTargets.includes(target);
  const excluded = config.excludedTargets.includes(target);

  if (trade.selectionMode === "allowlist") {
    const explicitlyAllowed = config.tradeTargets.includes(target);
    return {
      name: "allowlist",
      status: selected && explicitlyAllowed && !excluded ? "pass" : "fail",
      detail: selected && explicitlyAllowed && !excluded
        ? "Target is present in the current allowlist selection."
        : "Target is not present in TRADE_TARGETS after exclusions are applied."
    };
  }

  return {
    name: "allowlist",
    status: selected && !excluded ? "pass" : "fail",
    detail: selected && !excluded
      ? "Auto-selection produced this target and it is not excluded."
      : "Auto-selection did not keep this target in the final selection set."
  };
}

function buildMaxOrderGate(config: AppConfig, wouldSubmitOrder: ExecutionPreviewOrderPayload | undefined): ExecutionPreviewGateResult {
  const orderValue = parseFiniteNumber(wouldSubmitOrder?.value);

  if (orderValue === undefined) {
    return {
      name: "max-order",
      status: "fail",
      detail: "Order value is missing, so MAX_ORDER_KRW cannot be verified."
    };
  }

  return {
    name: "max-order",
    status: orderValue <= config.riskControls.maxOrderKrw ? "pass" : "fail",
    detail: orderValue <= config.riskControls.maxOrderKrw
      ? `Order value ${formatDecimal(orderValue)} stays within MAX_ORDER_KRW=${config.riskControls.maxOrderKrw}.`
      : `Order value ${formatDecimal(orderValue)} exceeds MAX_ORDER_KRW=${config.riskControls.maxOrderKrw}.`
  };
}

function buildMinReserveGate(
  config: AppConfig,
  trade: TradeOnceResult,
  action: TradeDecision["action"],
  wouldSubmitOrder: ExecutionPreviewOrderPayload | undefined
): ExecutionPreviewGateResult {
  if (action !== "buy") {
    return {
      name: "min-reserve",
      status: "not-applicable",
      detail: "MIN_CASH_RESERVE_KRW applies only to buy previews."
    };
  }

  const availableKrw = parseFiniteNumber(trade.portfolio.availableKrw);
  const orderValue = parseFiniteNumber(wouldSubmitOrder?.value);

  if (availableKrw === undefined || orderValue === undefined) {
    return {
      name: "min-reserve",
      status: "fail",
      detail: "Available KRW balance or order value is missing."
    };
  }

  const remainingCash = availableKrw - orderValue;
  return {
    name: "min-reserve",
    status: remainingCash >= config.riskControls.minCashReserveKrw ? "pass" : "fail",
    detail: remainingCash >= config.riskControls.minCashReserveKrw
      ? `Remaining KRW ${formatDecimal(remainingCash)} stays above MIN_CASH_RESERVE_KRW=${config.riskControls.minCashReserveKrw}.`
      : `Remaining KRW ${formatDecimal(Math.max(0, remainingCash))} falls below MIN_CASH_RESERVE_KRW=${config.riskControls.minCashReserveKrw}.`
  };
}

function buildLiveFlagGate(config: AppConfig): ExecutionPreviewGateResult {
  return {
    name: "live-flag",
    status: config.enableLiveTrading ? "pass" : "fail",
    detail: config.enableLiveTrading
      ? "ENABLE_LIVE_TRADING=true."
      : "ENABLE_LIVE_TRADING=false."
  };
}

function buildKillSwitchGate(config: AppConfig): ExecutionPreviewGateResult {
  return {
    name: "kill-switch",
    status: config.tradingKillSwitch ? "fail" : "pass",
    detail: config.tradingKillSwitch
      ? "TRADING_KILL_SWITCH=true."
      : "TRADING_KILL_SWITCH=false."
  };
}

function buildDryRunGate(config: AppConfig): ExecutionPreviewGateResult {
  return {
    name: "dry-run-policy",
    status: config.dryRun ? "fail" : "pass",
    detail: config.dryRun
      ? "DRY_RUN=true keeps preview execution blocked."
      : "DRY_RUN=false, but execution:preview still remains preview-only."
  };
}

function buildSkippedGates(): ExecutionPreviewGateResult[] {
  return [
    "payload",
    "allowlist",
    "max-order",
    "min-reserve",
    "live-flag",
    "kill-switch",
    "dry-run-policy"
  ].map((name) => ({
    name: name as ExecutionPreviewGateResult["name"],
    status: "not-applicable" as const,
    detail: "Skipped because the decision action is hold."
  }));
}

function buildKoreanPreviewSummary(trade: TradeOnceResult): ExecutionPreviewArtifact["summary"] {
  const executableCount = trade.decisions.filter((decision) => decision.action !== "hold").length;
  const holdCount = trade.decisions.length - executableCount;

  return {
    locale: "ko-KR",
    headline: "실행 미리보기 결과",
    summary: `실행 후보 ${executableCount}건과 홀드 ${holdCount}건을 점검했고, 모든 결과는 미리보기로만 저장되며 실제 주문은 전송되지 않습니다.`
  };
}

function buildEntrySummary(decision: TradeDecision, validation: ExecutionPreviewEntry["validation"]): string {
  if (decision.action === "hold") {
    return `${decision.target}은 기존 결정 엔진이 홀드를 반환해 주문 페이로드를 만들지 않았습니다.`;
  }

  const blockedBy = validation.gates
    .filter((gate) => gate.status === "fail")
    .map((gate) => localizeGateName(gate.name));
  const blockLabel = blockedBy.length > 0 ? blockedBy.join(", ") : "미리보기 전용 경로";

  return `${decision.target} ${localizeAction(decision.action)} 주문 페이로드를 계산했지만 최종 검증에서 차단됐습니다. 사유: ${blockLabel}.`;
}

async function persistPreviewArtifact(outputDir: string, preview: ExecutionPreviewArtifact): Promise<ExecutionPreviewRunResult["output"]> {
  const baseDir = path.resolve(outputDir);
  const previewDir = path.join(baseDir, "previews");

  await mkdir(previewDir, { recursive: true });

  const fileName = `${preview.createdAt.replace(/[:.]/g, "-")}.json`;
  const previewLatestPath = path.join(previewDir, "latest.json");
  const previewDatedPath = path.join(previewDir, fileName);

  await Promise.all([
    writeJson(previewLatestPath, preview),
    writeJson(previewDatedPath, preview)
  ]);

  return {
    baseDir,
    previewLatestPath,
    previewDatedPath
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildRunId(prefix: string, timestamp: string): string {
  return `${prefix}-${timestamp.replace(/[:.]/g, "-")}`;
}

function parseFiniteNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function multiplyDecimals(left: string | undefined, right: string | undefined): string | undefined {
  const leftValue = parseFiniteNumber(left);
  const rightValue = parseFiniteNumber(right);

  if (leftValue === undefined || rightValue === undefined) {
    return undefined;
  }

  return formatDecimal(leftValue * rightValue);
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(8).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function localizeAction(action: TradeDecision["action"]): string {
  if (action === "buy") {
    return "매수";
  }

  if (action === "sell") {
    return "매도";
  }

  return "홀드";
}

function localizeGateName(name: ExecutionPreviewGateResult["name"]): string {
  if (name === "payload") {
    return "주문 페이로드 불완전";
  }

  if (name === "allowlist") {
    return "허용 대상 검증 실패";
  }

  if (name === "max-order") {
    return "최대 주문 금액 초과";
  }

  if (name === "min-reserve") {
    return "최소 현금 보유금 부족";
  }

  if (name === "live-flag") {
    return "라이브 거래 비활성화";
  }

  if (name === "kill-switch") {
    return "킬 스위치 활성화";
  }

  return "DRY_RUN 정책 차단";
}
