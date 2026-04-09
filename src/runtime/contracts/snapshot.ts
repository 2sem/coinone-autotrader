export type RuntimeSnapshotMarketSource = "live-cli" | "mock";
export type RuntimeSnapshotAccountSource = "live-cli" | "unavailable";

export interface RuntimeSnapshotTicker {
  target: string;
  pair: string;
  last?: string;
  bestBidPrice?: string;
  bestAskPrice?: string;
  quoteVolume?: string;
}

export interface RuntimeSnapshotPosition {
  target: string;
  pair: string;
  heldQuantity: string;
  averageEntryPrice?: string;
  markPrice?: string;
  positionValueKrw?: string;
  recentOrderAt?: string;
}

export interface RuntimeSnapshotFeeInfo {
  pair: string;
  quote: string;
  target: string;
  makerFeeBps?: number;
  takerFeeBps?: number;
  source: "fees-get" | "unavailable";
}

export interface RuntimeSnapshot {
  schemaVersion: "1";
  snapshotId: string;
  createdAt: string;
  market: {
    mode: "auto" | "live" | "mock";
    source: RuntimeSnapshotMarketSource;
    quoteCurrency: string;
    selectedTargets: string[];
    tickers: RuntimeSnapshotTicker[];
    notes: string[];
  };
  account: {
    source: RuntimeSnapshotAccountSource;
    configured: boolean;
    availableKrw?: string;
    balances: Array<Record<string, unknown>>;
    completedOrders: Array<Record<string, unknown>>;
    notes: string[];
  };
  portfolio: {
    positions: RuntimeSnapshotPosition[];
  };
  fees: RuntimeSnapshotFeeInfo[];
  priorState?: {
    lastDecisionId?: string;
    lastExecutionId?: string;
  };
}

export function validateRuntimeSnapshot(value: unknown): RuntimeSnapshot {
  const snapshot = expectRecord(value, "snapshot");

  expectLiteral(snapshot.schemaVersion, "1", "snapshot.schemaVersion");
  expectString(snapshot.snapshotId, "snapshot.snapshotId");
  expectString(snapshot.createdAt, "snapshot.createdAt");

  const market = expectRecord(snapshot.market, "snapshot.market");
  expectEnum(market.mode, ["auto", "live", "mock"], "snapshot.market.mode");
  expectEnum(market.source, ["live-cli", "mock"], "snapshot.market.source");
  expectString(market.quoteCurrency, "snapshot.market.quoteCurrency");
  expectStringArray(market.selectedTargets, "snapshot.market.selectedTargets");
  expectArray(market.tickers, "snapshot.market.tickers").forEach((entry, index) => validateTicker(entry, index));
  expectStringArray(market.notes, "snapshot.market.notes");

  const account = expectRecord(snapshot.account, "snapshot.account");
  expectEnum(account.source, ["live-cli", "unavailable"], "snapshot.account.source");
  expectBoolean(account.configured, "snapshot.account.configured");
  optionalString(account.availableKrw, "snapshot.account.availableKrw");
  expectArray(account.balances, "snapshot.account.balances").forEach((entry, index) => expectRecord(entry, `snapshot.account.balances[${index}]`));
  expectArray(account.completedOrders, "snapshot.account.completedOrders").forEach((entry, index) =>
    expectRecord(entry, `snapshot.account.completedOrders[${index}]`)
  );
  expectStringArray(account.notes, "snapshot.account.notes");

  const portfolio = expectRecord(snapshot.portfolio, "snapshot.portfolio");
  expectArray(portfolio.positions, "snapshot.portfolio.positions").forEach((entry, index) => validatePosition(entry, index));

  expectArray(snapshot.fees, "snapshot.fees").forEach((entry, index) => validateFee(entry, index));

  if (snapshot.priorState !== undefined) {
    const priorState = expectRecord(snapshot.priorState, "snapshot.priorState");
    optionalString(priorState.lastDecisionId, "snapshot.priorState.lastDecisionId");
    optionalString(priorState.lastExecutionId, "snapshot.priorState.lastExecutionId");
  }

  return snapshot as unknown as RuntimeSnapshot;
}

function validateTicker(value: unknown, index: number): void {
  const ticker = expectRecord(value, `snapshot.market.tickers[${index}]`);
  expectString(ticker.target, `snapshot.market.tickers[${index}].target`);
  expectString(ticker.pair, `snapshot.market.tickers[${index}].pair`);
  optionalString(ticker.last, `snapshot.market.tickers[${index}].last`);
  optionalString(ticker.bestBidPrice, `snapshot.market.tickers[${index}].bestBidPrice`);
  optionalString(ticker.bestAskPrice, `snapshot.market.tickers[${index}].bestAskPrice`);
  optionalString(ticker.quoteVolume, `snapshot.market.tickers[${index}].quoteVolume`);
}

function validatePosition(value: unknown, index: number): void {
  const position = expectRecord(value, `snapshot.portfolio.positions[${index}]`);
  expectString(position.target, `snapshot.portfolio.positions[${index}].target`);
  expectString(position.pair, `snapshot.portfolio.positions[${index}].pair`);
  expectString(position.heldQuantity, `snapshot.portfolio.positions[${index}].heldQuantity`);
  optionalString(position.averageEntryPrice, `snapshot.portfolio.positions[${index}].averageEntryPrice`);
  optionalString(position.markPrice, `snapshot.portfolio.positions[${index}].markPrice`);
  optionalString(position.positionValueKrw, `snapshot.portfolio.positions[${index}].positionValueKrw`);
  optionalString(position.recentOrderAt, `snapshot.portfolio.positions[${index}].recentOrderAt`);
}

function validateFee(value: unknown, index: number): void {
  const fee = expectRecord(value, `snapshot.fees[${index}]`);
  expectString(fee.pair, `snapshot.fees[${index}].pair`);
  expectString(fee.quote, `snapshot.fees[${index}].quote`);
  expectString(fee.target, `snapshot.fees[${index}].target`);
  optionalNumber(fee.makerFeeBps, `snapshot.fees[${index}].makerFeeBps`);
  optionalNumber(fee.takerFeeBps, `snapshot.fees[${index}].takerFeeBps`);
  expectEnum(fee.source, ["fees-get", "unavailable"], `snapshot.fees[${index}].source`);
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

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectString(value, label);
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
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
