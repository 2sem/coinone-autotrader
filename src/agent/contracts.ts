export type SnapshotSource = "live-cli" | "mock";
export type AccountSource = "live-cli" | "skipped";
export type DecisionAction = "buy" | "sell" | "hold";
export type DecisionProviderName = "mock" | "openai-compatible";
export type DecisionProviderKind = "deterministic" | "model-backed";
export type ExecutionStatus = "recorded" | "skipped";

export interface AgentTickerSnapshot {
  pair: string;
  target: string;
  last?: string;
  bestBidPrice?: string;
  bestAskPrice?: string;
  quoteVolume?: string;
}

export interface AgentBalanceSnapshot {
  currency: string;
  available?: string;
  locked?: string;
  averagePrice?: string;
}

export interface AgentCompletedOrderSnapshot {
  tradeId?: string;
  orderId?: string;
  pair?: string;
  side?: string;
  price?: string;
  qty?: string;
  completedAt?: string;
}

export interface AgentPositionSnapshot {
  target: string;
  pair: string;
  heldQuantity: string;
  averageEntryPrice?: string;
  markPrice?: string;
  positionValueQuote?: string;
}

export interface AgentMarketDecisionSnapshot {
  schemaVersion: "1";
  snapshotId: string;
  createdAt: string;
  dryRun: boolean;
  liveTradingEnabled: boolean;
  liveTradingBlocked: boolean;
  source: SnapshotSource;
  provider: DecisionProviderName;
  quoteCurrency: string;
  selectionMode: "allowlist" | "auto";
  selectedTargets: string[];
  excludedTargets: string[];
  rankedTargets: string[];
  availableMarketCount: number;
  tickers: AgentTickerSnapshot[];
  account: {
    source: AccountSource;
    configured: boolean;
    balances: AgentBalanceSnapshot[];
    completedOrders: AgentCompletedOrderSnapshot[];
  };
  portfolio: {
    availableQuoteBalance?: string;
    positions: AgentPositionSnapshot[];
  };
  notes: string[];
}

export interface AgentDecisionContract {
  schemaVersion: "1";
  decisionId: string;
  snapshotId: string;
  createdAt: string;
  provider: DecisionProviderName;
   providerKind: DecisionProviderKind;
  action: DecisionAction;
  target?: string;
  pair?: string;
  quoteCurrency: string;
  confidence: "low" | "medium" | "high";
  confidenceScore?: number;
  reason: string;
  riskNotes: string[];
  stateUpdates: AgentStateUpdate[];
  order: {
    orderValue?: string;
    quantity?: string;
  };
  providerContext: {
    requestId: string;
    promptVersion: string;
    model?: string;
    temperature?: number;
    rawResponseFormat: "json";
  };
  safeguards: {
    dryRun: boolean;
    liveTradingEnabled: boolean;
    liveTradingBlocked: boolean;
    readOnlyData: boolean;
  };
  evidence: {
    selectedTargets: string[];
    notes: string[];
  };
  userFacing: AgentDecisionUserFacingSummary;
}

export interface AgentStateUpdate {
  key: string;
  value: string;
  reason: string;
}

export interface AgentDecisionUserFacingSummary {
  locale: "ko-KR";
  headline: string;
  summary: string;
  riskNotes: string[];
  evidenceNotes: string[];
}

export interface AgentDryRunExecutionRecord {
  schemaVersion: "1";
  executionId: string;
  decisionId: string;
  snapshotId: string;
  createdAt: string;
  provider: DecisionProviderName;
  providerKind: DecisionProviderKind;
  dryRun: true;
  status: ExecutionStatus;
  action: DecisionAction;
  target?: string;
  pair?: string;
  quoteCurrency: string;
  decisionValidated: true;
  validationNotes: string[];
  riskNotes: string[];
  stateUpdates: AgentStateUpdate[];
  executionPlan: {
    orderValue?: string;
    quantity?: string;
    executionBlocked: boolean;
    blockReasons: string[];
  };
}

export interface AgentDecisionState {
  schemaVersion: "1";
  updatedAt: string;
  latestSnapshotId: string;
  latestDecisionId: string;
  latestExecutionId: string;
  latestAction: DecisionAction;
  latestTarget?: string;
  latestSnapshotPath: string;
  latestDecisionPath: string;
  latestExecutionPath: string;
  provider: DecisionProviderName;
}

export function validateAgentMarketDecisionSnapshot(value: unknown): AgentMarketDecisionSnapshot {
  const snapshot = expectRecord(value, "snapshot");

  expectLiteral(snapshot.schemaVersion, "1", "snapshot.schemaVersion");
  expectString(snapshot.snapshotId, "snapshot.snapshotId");
  expectString(snapshot.createdAt, "snapshot.createdAt");
  expectBoolean(snapshot.dryRun, "snapshot.dryRun");
  expectBoolean(snapshot.liveTradingEnabled, "snapshot.liveTradingEnabled");
  expectBoolean(snapshot.liveTradingBlocked, "snapshot.liveTradingBlocked");
  expectEnum(snapshot.source, ["live-cli", "mock"], "snapshot.source");
  expectEnum(snapshot.provider, ["mock", "openai-compatible"], "snapshot.provider");
  expectString(snapshot.quoteCurrency, "snapshot.quoteCurrency");
  expectEnum(snapshot.selectionMode, ["allowlist", "auto"], "snapshot.selectionMode");
  expectStringArray(snapshot.selectedTargets, "snapshot.selectedTargets");
  expectStringArray(snapshot.excludedTargets, "snapshot.excludedTargets");
  expectStringArray(snapshot.rankedTargets, "snapshot.rankedTargets");
  expectNumber(snapshot.availableMarketCount, "snapshot.availableMarketCount");
  expectArray(snapshot.tickers, "snapshot.tickers").forEach((entry, index) => validateTickerSnapshot(entry, index));

  const account = expectRecord(snapshot.account, "snapshot.account");
  expectEnum(account.source, ["live-cli", "skipped"], "snapshot.account.source");
  expectBoolean(account.configured, "snapshot.account.configured");
  expectArray(account.balances, "snapshot.account.balances").forEach((entry, index) => validateBalanceSnapshot(entry, index));
  expectArray(account.completedOrders, "snapshot.account.completedOrders").forEach((entry, index) => validateCompletedOrderSnapshot(entry, index));

  const portfolio = expectRecord(snapshot.portfolio, "snapshot.portfolio");
  if (portfolio.availableQuoteBalance !== undefined) {
    expectString(portfolio.availableQuoteBalance, "snapshot.portfolio.availableQuoteBalance");
  }
  expectArray(portfolio.positions, "snapshot.portfolio.positions").forEach((entry, index) => validatePositionSnapshot(entry, index));
  expectStringArray(snapshot.notes, "snapshot.notes");

  return snapshot as unknown as AgentMarketDecisionSnapshot;
}

export function validateAgentDecisionContract(value: unknown): AgentDecisionContract {
  const decision = expectRecord(value, "decision");

  expectLiteral(decision.schemaVersion, "1", "decision.schemaVersion");
  expectString(decision.decisionId, "decision.decisionId");
  expectString(decision.snapshotId, "decision.snapshotId");
  expectString(decision.createdAt, "decision.createdAt");
  expectEnum(decision.provider, ["mock", "openai-compatible"], "decision.provider");
  expectEnum(decision.providerKind, ["deterministic", "model-backed"], "decision.providerKind");
  expectEnum(decision.action, ["buy", "sell", "hold"], "decision.action");
  optionalString(decision.target, "decision.target");
  optionalString(decision.pair, "decision.pair");
  expectString(decision.quoteCurrency, "decision.quoteCurrency");
  expectEnum(decision.confidence, ["low", "medium", "high"], "decision.confidence");
  optionalConfidenceScore(decision.confidenceScore, "decision.confidenceScore");
  expectString(decision.reason, "decision.reason");
  expectStringArray(decision.riskNotes, "decision.riskNotes");
  expectArray(decision.stateUpdates, "decision.stateUpdates").forEach((entry, index) => validateStateUpdate(entry, index, "decision.stateUpdates"));

  const order = expectRecord(decision.order, "decision.order");
  optionalString(order.orderValue, "decision.order.orderValue");
  optionalString(order.quantity, "decision.order.quantity");

  const providerContext = expectRecord(decision.providerContext, "decision.providerContext");
  expectString(providerContext.requestId, "decision.providerContext.requestId");
  expectString(providerContext.promptVersion, "decision.providerContext.promptVersion");
  optionalString(providerContext.model, "decision.providerContext.model");
  optionalTemperature(providerContext.temperature, "decision.providerContext.temperature");
  expectLiteral(providerContext.rawResponseFormat, "json", "decision.providerContext.rawResponseFormat");

  const safeguards = expectRecord(decision.safeguards, "decision.safeguards");
  expectBoolean(safeguards.dryRun, "decision.safeguards.dryRun");
  expectBoolean(safeguards.liveTradingEnabled, "decision.safeguards.liveTradingEnabled");
  expectBoolean(safeguards.liveTradingBlocked, "decision.safeguards.liveTradingBlocked");
  expectBoolean(safeguards.readOnlyData, "decision.safeguards.readOnlyData");

  const evidence = expectRecord(decision.evidence, "decision.evidence");
  expectStringArray(evidence.selectedTargets, "decision.evidence.selectedTargets");
  expectStringArray(evidence.notes, "decision.evidence.notes");

  const userFacing = expectRecord(decision.userFacing, "decision.userFacing");
  expectLiteral(userFacing.locale, "ko-KR", "decision.userFacing.locale");
  expectString(userFacing.headline, "decision.userFacing.headline");
  expectString(userFacing.summary, "decision.userFacing.summary");
  expectStringArray(userFacing.riskNotes, "decision.userFacing.riskNotes");
  expectStringArray(userFacing.evidenceNotes, "decision.userFacing.evidenceNotes");

  return decision as unknown as AgentDecisionContract;
}

export function validateAgentDryRunExecutionRecord(value: unknown): AgentDryRunExecutionRecord {
  const execution = expectRecord(value, "execution");

  expectLiteral(execution.schemaVersion, "1", "execution.schemaVersion");
  expectString(execution.executionId, "execution.executionId");
  expectString(execution.decisionId, "execution.decisionId");
  expectString(execution.snapshotId, "execution.snapshotId");
  expectString(execution.createdAt, "execution.createdAt");
  expectEnum(execution.provider, ["mock", "openai-compatible"], "execution.provider");
  expectEnum(execution.providerKind, ["deterministic", "model-backed"], "execution.providerKind");
  expectLiteral(execution.dryRun, true, "execution.dryRun");
  expectEnum(execution.status, ["recorded", "skipped"], "execution.status");
  expectEnum(execution.action, ["buy", "sell", "hold"], "execution.action");
  optionalString(execution.target, "execution.target");
  optionalString(execution.pair, "execution.pair");
  expectString(execution.quoteCurrency, "execution.quoteCurrency");
  expectLiteral(execution.decisionValidated, true, "execution.decisionValidated");
  expectStringArray(execution.validationNotes, "execution.validationNotes");
  expectStringArray(execution.riskNotes, "execution.riskNotes");
  expectArray(execution.stateUpdates, "execution.stateUpdates").forEach((entry, index) =>
    validateStateUpdate(entry, index, "execution.stateUpdates")
  );

  const executionPlan = expectRecord(execution.executionPlan, "execution.executionPlan");
  optionalString(executionPlan.orderValue, "execution.executionPlan.orderValue");
  optionalString(executionPlan.quantity, "execution.executionPlan.quantity");
  expectBoolean(executionPlan.executionBlocked, "execution.executionPlan.executionBlocked");
  expectStringArray(executionPlan.blockReasons, "execution.executionPlan.blockReasons");

  return execution as unknown as AgentDryRunExecutionRecord;
}

export function validateAgentDecisionState(value: unknown): AgentDecisionState {
  const state = expectRecord(value, "state");

  expectLiteral(state.schemaVersion, "1", "state.schemaVersion");
  expectString(state.updatedAt, "state.updatedAt");
  expectString(state.latestSnapshotId, "state.latestSnapshotId");
  expectString(state.latestDecisionId, "state.latestDecisionId");
  expectString(state.latestExecutionId, "state.latestExecutionId");
  expectEnum(state.latestAction, ["buy", "sell", "hold"], "state.latestAction");
  optionalString(state.latestTarget, "state.latestTarget");
  expectString(state.latestSnapshotPath, "state.latestSnapshotPath");
  expectString(state.latestDecisionPath, "state.latestDecisionPath");
  expectString(state.latestExecutionPath, "state.latestExecutionPath");
  expectEnum(state.provider, ["mock", "openai-compatible"], "state.provider");

  return state as unknown as AgentDecisionState;
}

function validateStateUpdate(value: unknown, index: number, label: string): void {
  const update = expectRecord(value, `${label}[${index}]`);
  expectString(update.key, `${label}[${index}].key`);
  expectString(update.value, `${label}[${index}].value`);
  expectString(update.reason, `${label}[${index}].reason`);
}

function validateTickerSnapshot(value: unknown, index: number): void {
  const ticker = expectRecord(value, `snapshot.tickers[${index}]`);
  expectString(ticker.pair, `snapshot.tickers[${index}].pair`);
  expectString(ticker.target, `snapshot.tickers[${index}].target`);
  optionalString(ticker.last, `snapshot.tickers[${index}].last`);
  optionalString(ticker.bestBidPrice, `snapshot.tickers[${index}].bestBidPrice`);
  optionalString(ticker.bestAskPrice, `snapshot.tickers[${index}].bestAskPrice`);
  optionalString(ticker.quoteVolume, `snapshot.tickers[${index}].quoteVolume`);
}

function validateBalanceSnapshot(value: unknown, index: number): void {
  const balance = expectRecord(value, `snapshot.account.balances[${index}]`);
  expectString(balance.currency, `snapshot.account.balances[${index}].currency`);
  optionalString(balance.available, `snapshot.account.balances[${index}].available`);
  optionalString(balance.locked, `snapshot.account.balances[${index}].locked`);
  optionalString(balance.averagePrice, `snapshot.account.balances[${index}].averagePrice`);
}

function validateCompletedOrderSnapshot(value: unknown, index: number): void {
  const order = expectRecord(value, `snapshot.account.completedOrders[${index}]`);
  optionalString(order.tradeId, `snapshot.account.completedOrders[${index}].tradeId`);
  optionalString(order.orderId, `snapshot.account.completedOrders[${index}].orderId`);
  optionalString(order.pair, `snapshot.account.completedOrders[${index}].pair`);
  optionalString(order.side, `snapshot.account.completedOrders[${index}].side`);
  optionalString(order.price, `snapshot.account.completedOrders[${index}].price`);
  optionalString(order.qty, `snapshot.account.completedOrders[${index}].qty`);
  optionalString(order.completedAt, `snapshot.account.completedOrders[${index}].completedAt`);
}

function validatePositionSnapshot(value: unknown, index: number): void {
  const position = expectRecord(value, `snapshot.portfolio.positions[${index}]`);
  expectString(position.target, `snapshot.portfolio.positions[${index}].target`);
  expectString(position.pair, `snapshot.portfolio.positions[${index}].pair`);
  expectString(position.heldQuantity, `snapshot.portfolio.positions[${index}].heldQuantity`);
  optionalString(position.averageEntryPrice, `snapshot.portfolio.positions[${index}].averageEntryPrice`);
  optionalString(position.markPrice, `snapshot.portfolio.positions[${index}].markPrice`);
  optionalString(position.positionValueQuote, `snapshot.portfolio.positions[${index}].positionValueQuote`);
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

function expectString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function optionalString(value: unknown, label: string): void {
  if (value !== undefined) {
    expectString(value, label);
  }
}

function expectStringArray(value: unknown, label: string): void {
  expectArray(value, label).forEach((entry, index) => expectString(entry, `${label}[${index}]`));
}

function expectBoolean(value: unknown, label: string): void {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
}

function expectNumber(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function optionalConfidenceScore(value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number between 0 and 1.`);
  }
}

function optionalTemperature(value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error(`${label} must be a finite number between 0 and 2.`);
  }
}

function expectLiteral(value: unknown, expected: string | boolean, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} must equal ${expected}.`);
  }
}

function expectEnum(value: unknown, allowed: string[], label: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
}
