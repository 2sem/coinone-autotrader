import type { AgentDecisionContract, AgentDryRunExecutionRecord } from "./contracts.js";
import { validateAgentDecisionContract, validateAgentDryRunExecutionRecord } from "./contracts.js";
import { buildRunId } from "./snapshot.js";

export function buildDryRunExecutionRecord(decisionValue: unknown): AgentDryRunExecutionRecord {
  const decision = validateAgentDecisionContract(decisionValue);
  const createdAt = new Date().toISOString();
  const blockReasons = buildBlockReasons(decision);

  return validateAgentDryRunExecutionRecord({
    schemaVersion: "1",
    executionId: buildRunId("execution", createdAt),
    decisionId: decision.decisionId,
    snapshotId: decision.snapshotId,
    createdAt,
    provider: decision.provider,
    providerKind: decision.providerKind,
    dryRun: true,
    status: "recorded",
    action: decision.action,
    target: decision.target,
    pair: decision.pair,
    quoteCurrency: decision.quoteCurrency,
    decisionValidated: true,
    validationNotes: [
      "Decision contract passed schema validation before execution recording.",
      "Execution record is persisted only for dry-run inspection; no external order path is called."
    ],
    riskNotes: decision.riskNotes,
    stateUpdates: decision.stateUpdates,
    executionPlan: {
      orderValue: decision.order.orderValue,
      quantity: decision.order.quantity,
      executionBlocked: true,
      blockReasons
    }
  });
}

function buildBlockReasons(decision: AgentDecisionContract): string[] {
  const reasons = [
    "Live trading remains disabled for the agent workflow.",
    decision.safeguards.liveTradingBlocked
      ? "Safety gate marked live trading as blocked for this run."
      : "Dry-run execution records never escalate into live order placement."
  ];

  if (decision.action === "hold") {
    reasons.push("Decision action is hold, so nothing would be sent for execution.");
  }

  if (!decision.order.orderValue && !decision.order.quantity) {
    reasons.push("Decision did not include executable order sizing.");
  }

  return reasons;
}
