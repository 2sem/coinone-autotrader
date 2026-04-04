import type { AppConfig, StrategyProfileName } from "../config/env.js";
import type { CoinoneBalance, CoinoneCompletedOrder, CoinoneTicker } from "../adapters/coinone-cli.js";
import { loadMarketSnapshot } from "./market-data.js";
import { resolveSelectionPlan } from "./selection.js";

const BUY_PREMIUM_THRESHOLD = 0.98;
const SELL_TAKE_PROFIT_THRESHOLD = 1.03;
const SELL_STOP_LOSS_THRESHOLD = 0.95;

const STRATEGY_PROFILES: Record<StrategyProfileName, { buyBudgetMultiplier: number; allowSell: boolean; summary: string }> = {
  default: {
    buyBudgetMultiplier: 1,
    allowSell: true,
    summary: "Balanced dry-run profile using the existing conservative buy and sell bands."
  },
  stablecoin: {
    buyBudgetMultiplier: 0.5,
    allowSell: false,
    summary: "Stablecoin accumulation profile with smaller capped buys and no dry-run sell recommendations."
  }
};

export interface SelectedMarketData {
  pair: string;
  last?: string;
  bestBidPrice?: string;
  bestAskPrice?: string;
  quoteVolume?: string;
}

export interface PortfolioSnapshot {
  availableKrw?: string;
  positions: PositionSnapshot[];
}

export interface PositionSnapshot {
  target: string;
  pair: string;
  heldQuantity: string;
  averageEntryPrice?: string;
  markPrice?: string;
  positionValueKrw?: string;
  recentOrder?: RecentOrderSnapshot;
}

export interface RecentOrderSnapshot {
  side?: string;
  completedAt?: string;
  recencyMinutes?: number;
}

export interface DecisionSignalDetails {
  summary: string;
  pair: string;
  hasPosition: boolean;
  markPrice?: string;
  bestBidPrice?: string;
  bestAskPrice?: string;
  averageEntryPrice?: string;
  recentOrderSide?: string;
  recentOrderCompletedAt?: string;
}

export interface DecisionRiskDetails {
  availableKrw?: string;
  spendableCashKrw?: string;
  proposedBuyBudgetKrw?: string;
  currentOpenPositions: number;
  remainingOpenPositions: number;
  portfolioExposurePct?: string;
  remainingPortfolioExposurePct?: string;
  completedBuyValueTodayKrw: string;
  completedTradesToday: number;
  remainingDailyBuyKrw: string;
  remainingTradesToday: number;
  cooldownMinutesRemaining?: number;
  executionBlockedReasons: string[];
  holdReasons: string[];
}

export interface TradeDecision {
  target: string;
  action: "buy" | "sell" | "hold";
  profileUsed: StrategyProfileName;
  reason: string;
  recommendedOrderValueKrw?: string;
  recommendedQuantity?: string;
  signal: DecisionSignalDetails;
  risk: DecisionRiskDetails;
}

export interface TradeOnceResult {
  dryRun: boolean;
  quoteCurrency: string;
  marketDataMode: AppConfig["marketDataMode"];
  marketDataSource: "live-cli" | "mock";
  selectionMode: AppConfig["selectionMode"];
  selectedTargets: string[];
  marketSymbols: string[];
  selectedMarketData: SelectedMarketData[];
  availableMarketCount: number;
  riskControls: AppConfig["riskControls"];
  strategyProfiles: {
    defaultProfile: StrategyProfileName;
    stablecoinTargets: string[];
    overrides: Record<string, StrategyProfileName>;
  };
  account: {
    source: "live-cli" | "unavailable";
    configured: boolean;
    balancesPreview: CoinoneBalance[];
    completedOrdersPreview: CoinoneCompletedOrder[];
  };
  portfolio: PortfolioSnapshot;
  decisions: TradeDecision[];
  workflow: string;
  notes: string[];
}

interface DailyTradeStats {
  completedTradesToday: number;
  completedBuyValueTodayKrw: number;
}

interface PortfolioRiskSnapshot {
  openPositions: number;
  totalPositionValueKrw: number;
  portfolioValueKrw?: number;
  portfolioExposurePct?: number;
}

export async function runTradeOnce(config: AppConfig): Promise<TradeOnceResult> {
  const marketSnapshot = await loadMarketSnapshot(config);
  const selectionPlan = resolveSelectionPlan(config, {
    availableTargets: marketSnapshot.markets.map((market) => market.target),
    rankedTargets: marketSnapshot.rankedTargets
  });
  const selectedTickers = selectTickers(selectionPlan.targets, marketSnapshot.tickers);
  const portfolio = buildPortfolioSnapshot(
    config,
    selectionPlan.targets,
    selectedTickers,
    marketSnapshot.account.balances,
    marketSnapshot.account.completedOrders
  );
  const decisions = buildTradeDecisions(
    config,
    portfolio,
    selectedTickers,
    marketSnapshot.account.completedOrders,
    marketSnapshot.account.configured
  );

  return {
    dryRun: config.dryRun,
    quoteCurrency: config.quoteCurrency,
    marketDataMode: config.marketDataMode,
    marketDataSource: marketSnapshot.source,
    selectionMode: selectionPlan.mode,
    selectedTargets: selectionPlan.targets,
    marketSymbols: selectionPlan.targets.map((target) => formatMarketSymbol(config.quoteCurrency, target)),
    selectedMarketData: selectedTickers.map((ticker) => ({
      pair: ticker.pair,
      last: ticker.last,
      bestBidPrice: ticker.bestBidPrice,
      bestAskPrice: ticker.bestAskPrice,
      quoteVolume: ticker.quoteVolume
    })),
    availableMarketCount: marketSnapshot.markets.length,
    riskControls: config.riskControls,
    strategyProfiles: {
      defaultProfile: config.defaultStrategyProfile,
      stablecoinTargets: config.stablecoinTargets,
      overrides: config.strategyProfileOverrides
    },
    account: {
      source: marketSnapshot.account.source,
      configured: marketSnapshot.account.configured,
      balancesPreview: marketSnapshot.account.balances.slice(0, 5),
      completedOrdersPreview: marketSnapshot.account.completedOrders.slice(0, 5)
    },
    portfolio,
    decisions,
    workflow: "dry-run only",
    notes: [
      ...marketSnapshot.notes,
      ...selectionPlan.notes,
      ...marketSnapshot.account.notes,
      selectedTickers.length === 0
        ? "No selected ticker data is available for this dry-run plan."
        : `Included ${selectedTickers.length} selected ticker snapshots from ${marketSnapshot.source} data.`,
      `Strategy profiles enabled: default=${config.defaultStrategyProfile}; auto-stablecoin targets=${config.stablecoinTargets.join(", ") || "none"}.`,
      `Daily buy cap MAX_DAILY_BUY_KRW=${config.riskControls.maxDailyBuyKrw} and trade cap MAX_TRADES_PER_DAY=${config.riskControls.maxTradesPerDay} are enforced from completed-order history when account reads are available.`,
      `Portfolio caps: MAX_OPEN_POSITIONS=${config.riskControls.maxOpenPositions}, MAX_PORTFOLIO_EXPOSURE_PCT=${formatPercent(config.riskControls.maxPortfolioExposurePct)}.`,
      config.enableLiveTrading
        ? config.tradingKillSwitch
          ? "ENABLE_LIVE_TRADING=true but TRADING_KILL_SWITCH=true, so any future live execution path would remain blocked."
          : "ENABLE_LIVE_TRADING=true is configured, but this repository still remains dry-run only until a guarded live adapter is added."
        : "ENABLE_LIVE_TRADING=false keeps future live execution paths blocked by default.",
      decisions.every((decision) => decision.action === "hold")
        ? "Decision engine stayed fully conservative and recommended hold for every selected target."
        : "Decision engine produced deterministic buy/sell/hold recommendations without placing orders.",
      "Live order placement remains intentionally disabled.",
      config.dryRun ? "DRY_RUN is enabled; no external side effects are allowed." : "DRY_RUN is disabled, but execution still remains simulation-only."
    ]
  };
}

function buildPortfolioSnapshot(
  config: AppConfig,
  targets: string[],
  tickers: CoinoneTicker[],
  balances: CoinoneBalance[],
  completedOrders: CoinoneCompletedOrder[]
): PortfolioSnapshot {
  const tickerByTarget = new Map(tickers.map((ticker) => [ticker.target, ticker]));
  const balanceByCurrency = new Map(balances.map((balance) => [balance.currency, balance]));

  return {
    availableKrw: config.quoteCurrency === "KRW" ? balanceByCurrency.get("KRW")?.available : undefined,
    positions: targets.map((target) => {
      const ticker = tickerByTarget.get(target);
      const balance = balanceByCurrency.get(target);
      const markPrice = selectMarkPrice(ticker);
      const heldQuantity = normalizeDecimal(balance?.available) ?? "0";
      const positionValue = markPrice !== undefined ? safeMultiply(heldQuantity, markPrice) : undefined;
      const recentOrder = buildRecentOrderSnapshot(config, target, completedOrders);

      return {
        target,
        pair: ticker?.pair ?? formatMarketSymbol(config.quoteCurrency, target),
        heldQuantity,
        averageEntryPrice: normalizeAverageEntryPrice(balance?.averagePrice, heldQuantity),
        markPrice: markPrice === undefined ? undefined : formatDecimal(markPrice),
        positionValueKrw: positionValue === undefined ? undefined : formatDecimal(positionValue),
        recentOrder
      };
    })
  };
}

function buildTradeDecisions(
  config: AppConfig,
  portfolio: PortfolioSnapshot,
  tickers: CoinoneTicker[],
  completedOrders: CoinoneCompletedOrder[],
  accountConfigured: boolean
): TradeDecision[] {
  const tickerByTarget = new Map(tickers.map((ticker) => [ticker.target, ticker]));
  const availableCash = parseFiniteNumber(portfolio.availableKrw);
  const dailyTradeStats = buildDailyTradeStats(config.quoteCurrency, completedOrders);
  const portfolioRisk = buildPortfolioRiskSnapshot(portfolio);

  return portfolio.positions.map((position) => {
    const profileUsed = resolveStrategyProfile(config, position.target);
    const profile = STRATEGY_PROFILES[profileUsed];
    const ticker = tickerByTarget.get(position.target);
    const heldQuantity = parseFiniteNumber(position.heldQuantity) ?? 0;
    const averageEntry = parseFiniteNumber(position.averageEntryPrice);
    const bestAsk = parseFiniteNumber(ticker?.bestAskPrice);
    const bestBid = parseFiniteNumber(ticker?.bestBidPrice);
    const markPrice = selectNumericMarkPrice(ticker);
    const positionValue = heldQuantity > 0 && markPrice !== undefined ? heldQuantity * markPrice : 0;
    const signal = buildSignalDetails(position, ticker, profileUsed);
    const risk = buildBaseRiskDetails(config, portfolio.availableKrw, dailyTradeStats, position.recentOrder, portfolioRisk);

    if (config.quoteCurrency !== "KRW") {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        risk,
        "Hold: daily risk sizing is defined in KRW and the selected quote currency is not KRW.",
        "Daily KRW risk caps only apply when QUOTE_CURRENCY=KRW."
      );
    }

    if (!accountConfigured) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        risk,
        "Hold: balances and completed-order history are unavailable, so daily caps cannot be enforced safely.",
        "Account data and valid Coinone credentials are required for conservative daily-cap enforcement."
      );
    }

    if (!ticker) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        risk,
        "Hold: ticker data is missing for this target.",
        "A recommendation is blocked until live or mock ticker data is available for the selected target."
      );
    }

    if (position.recentOrder?.recencyMinutes !== undefined && position.recentOrder.recencyMinutes < config.riskControls.cooldownMinutes) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        risk,
        `Hold: last completed order was ${position.recentOrder.recencyMinutes} minutes ago, inside cooldown ${config.riskControls.cooldownMinutes}m.`,
        `Cooldown remains active for ${config.riskControls.cooldownMinutes - position.recentOrder.recencyMinutes} more minutes.`
      );
    }

    if (heldQuantity > 0) {
      if (!profile.allowSell) {
        return holdDecision(
          position.target,
          profileUsed,
          signal,
          risk,
          "Hold: stablecoin profile keeps existing exposure and does not emit dry-run sell signals.",
          profile.summary
        );
      }

      if (bestBid === undefined || averageEntry === undefined || averageEntry <= 0) {
        return holdDecision(
          position.target,
          profileUsed,
          signal,
          risk,
          "Hold: a position exists, but bid price or average entry is missing.",
          "Sell decisions require both a current bid and a valid average entry price."
        );
      }

      const sellQty = floorQuantity(heldQuantity * config.riskControls.sellFractionOfPosition);

      if (sellQty <= 0) {
        return holdDecision(
          position.target,
          profileUsed,
          signal,
          risk,
          "Hold: configured sell fraction produces no sellable quantity.",
          "Increase SELL_FRACTION_OF_POSITION or hold a larger balance to surface a sell suggestion."
        );
      }

      if (bestBid >= averageEntry * SELL_TAKE_PROFIT_THRESHOLD) {
        return buildDecision(
          position.target,
          "sell",
          profileUsed,
          `Sell: best bid is at least ${(SELL_TAKE_PROFIT_THRESHOLD * 100 - 100).toFixed(0)}% above average entry.`,
          signal,
          risk,
          formatDecimal(sellQty * bestBid),
          formatDecimal(sellQty)
        );
      }

      if (bestBid <= averageEntry * SELL_STOP_LOSS_THRESHOLD) {
        return buildDecision(
          position.target,
          "sell",
          profileUsed,
          `Sell: best bid is at least ${(100 - SELL_STOP_LOSS_THRESHOLD * 100).toFixed(0)}% below average entry.`,
          signal,
          risk,
          formatDecimal(sellQty * bestBid),
          formatDecimal(sellQty)
        );
      }

      return holdDecision(
        position.target,
        profileUsed,
        signal,
        risk,
        "Hold: current price remains inside the conservative sell band.",
        "No take-profit or stop-loss threshold is active yet."
      );
    }

    if (availableCash === undefined) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        risk,
        "Hold: available KRW balance is missing.",
        "Buy sizing needs a current KRW balance snapshot."
      );
    }

    if (bestAsk === undefined || markPrice === undefined) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        risk,
        "Hold: ask price or mark price is missing, so buy sizing is uncertain.",
        "Conservative entries require both an ask and a mark price."
      );
    }

    const spendableCash = Math.max(0, availableCash - config.riskControls.minCashReserveKrw);

    if (spendableCash <= 0) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        { ...risk, spendableCashKrw: formatDecimal(spendableCash) },
        `Hold: available KRW stays at or below MIN_CASH_RESERVE_KRW=${config.riskControls.minCashReserveKrw}.`,
        "Cash reserve protection leaves no safe buy budget."
      );
    }

    if (portfolioRisk.openPositions >= config.riskControls.maxOpenPositions) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        { ...risk, spendableCashKrw: formatDecimal(spendableCash) },
        `Hold: open positions already reached MAX_OPEN_POSITIONS=${config.riskControls.maxOpenPositions}.`,
        "Portfolio concentration guard blocks new entries until an existing position is reduced or closed."
      );
    }

    if (portfolioRisk.portfolioExposurePct !== undefined && portfolioRisk.portfolioExposurePct >= config.riskControls.maxPortfolioExposurePct) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        { ...risk, spendableCashKrw: formatDecimal(spendableCash) },
        `Hold: portfolio exposure already reached MAX_PORTFOLIO_EXPOSURE_PCT=${formatPercent(config.riskControls.maxPortfolioExposurePct)}.`,
        "Portfolio-level exposure cap blocks additional buys."
      );
    }

    if (dailyTradeStats.completedTradesToday >= config.riskControls.maxTradesPerDay) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        { ...risk, spendableCashKrw: formatDecimal(spendableCash) },
        `Hold: completed trades today already reached MAX_TRADES_PER_DAY=${config.riskControls.maxTradesPerDay}.`,
        "Daily trade count cap is exhausted."
      );
    }

    const remainingDailyBuyKrw = Math.max(0, config.riskControls.maxDailyBuyKrw - dailyTradeStats.completedBuyValueTodayKrw);

    if (remainingDailyBuyKrw < 1) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        { ...risk, spendableCashKrw: formatDecimal(spendableCash) },
        `Hold: completed buy value today already reached MAX_DAILY_BUY_KRW=${config.riskControls.maxDailyBuyKrw}.`,
        "Daily buy budget is exhausted from completed orders."
      );
    }

    const baseBuyBudget = Math.min(
      config.riskControls.maxOrderKrw,
      spendableCash * config.riskControls.buyFractionOfCash,
      Math.max(0, config.riskControls.maxPositionPerAssetKrw - positionValue)
    );
    const proposedBuyBudget = Math.min(
      baseBuyBudget,
      remainingDailyBuyKrw,
      config.riskControls.maxOrderKrw * profile.buyBudgetMultiplier
    );
    const riskWithBudget = {
      ...risk,
      spendableCashKrw: formatDecimal(spendableCash),
      proposedBuyBudgetKrw: proposedBuyBudget > 0 ? formatDecimal(proposedBuyBudget) : undefined
    };

    if (proposedBuyBudget < 1) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        riskWithBudget,
        "Hold: configured caps leave no safe buy budget.",
        profileUsed === "stablecoin"
          ? "Stablecoin accumulation halves per-trade buy sizing before a buy is considered."
          : "Position and order caps leave no remaining allocation."
      );
    }

    if (averageEntry !== undefined) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        riskWithBudget,
        "Hold: no position is available, but average entry data is unexpectedly present.",
        "The account snapshot looks inconsistent, so the engine stays conservative."
      );
    }

    if (bestAsk > markPrice / BUY_PREMIUM_THRESHOLD) {
      return holdDecision(
        position.target,
        profileUsed,
        signal,
        riskWithBudget,
        "Hold: ask price is too far above the current mark price for a conservative entry.",
        "Entry is blocked until the ask converges closer to the mark price."
      );
    }

    return buildDecision(
      position.target,
      "buy",
      profileUsed,
      profileUsed === "stablecoin"
        ? "Buy: stablecoin profile allows a capped accumulation buy within daily risk limits."
        : "Buy: no current position, cash is above reserve, and sizing stays within configured caps.",
      signal,
      riskWithBudget,
      formatDecimal(proposedBuyBudget),
      formatDecimal(proposedBuyBudget / bestAsk)
    );
  });
}

function buildRecentOrderSnapshot(
  config: AppConfig,
  target: string,
  completedOrders: CoinoneCompletedOrder[],
  now: Date = new Date()
): RecentOrderSnapshot | undefined {
  const matchingOrder = completedOrders
    .filter((order) => {
      const pair = parsePair(order.pair);
      return pair?.target === target && pair.quote === config.quoteCurrency;
    })
    .sort((left, right) => compareIsoTimes(right.completedAt, left.completedAt))[0];

  if (!matchingOrder?.completedAt) {
    return undefined;
  }

  const completedAtMs = Date.parse(matchingOrder.completedAt);
  const recencyMinutes = Number.isFinite(completedAtMs)
    ? Math.max(0, Math.floor((now.getTime() - completedAtMs) / 60_000))
    : undefined;

  return {
    side: matchingOrder.side,
    completedAt: matchingOrder.completedAt,
    recencyMinutes
  };
}

function buildSignalDetails(position: PositionSnapshot, ticker: CoinoneTicker | undefined, profileUsed: StrategyProfileName): DecisionSignalDetails {
  return {
    summary: (parseFiniteNumber(position.heldQuantity) ?? 0) > 0
      ? `${profileUsed} profile sees an existing position and evaluates sell-or-hold conditions.`
      : `${profileUsed} profile sees no position and evaluates a fresh entry conservatively.`,
    pair: ticker?.pair ?? position.pair,
    hasPosition: (parseFiniteNumber(position.heldQuantity) ?? 0) > 0,
    markPrice: position.markPrice,
    bestBidPrice: ticker?.bestBidPrice,
    bestAskPrice: ticker?.bestAskPrice,
    averageEntryPrice: position.averageEntryPrice,
    recentOrderSide: position.recentOrder?.side,
    recentOrderCompletedAt: position.recentOrder?.completedAt
  };
}

function buildBaseRiskDetails(
  config: AppConfig,
  availableKrw: string | undefined,
  dailyTradeStats: DailyTradeStats,
  recentOrder: RecentOrderSnapshot | undefined,
  portfolioRisk: PortfolioRiskSnapshot
): DecisionRiskDetails {
  const remainingDailyBuyKrw = Math.max(0, config.riskControls.maxDailyBuyKrw - dailyTradeStats.completedBuyValueTodayKrw);
  const remainingTradesToday = Math.max(0, config.riskControls.maxTradesPerDay - dailyTradeStats.completedTradesToday);

  return {
    availableKrw,
    currentOpenPositions: portfolioRisk.openPositions,
    remainingOpenPositions: Math.max(0, config.riskControls.maxOpenPositions - portfolioRisk.openPositions),
    portfolioExposurePct: portfolioRisk.portfolioExposurePct === undefined ? undefined : formatPercent(portfolioRisk.portfolioExposurePct),
    remainingPortfolioExposurePct: portfolioRisk.portfolioExposurePct === undefined
      ? undefined
      : formatPercent(Math.max(0, config.riskControls.maxPortfolioExposurePct - portfolioRisk.portfolioExposurePct)),
    completedBuyValueTodayKrw: formatDecimal(dailyTradeStats.completedBuyValueTodayKrw),
    completedTradesToday: dailyTradeStats.completedTradesToday,
    remainingDailyBuyKrw: formatDecimal(remainingDailyBuyKrw),
    remainingTradesToday,
    cooldownMinutesRemaining: recentOrder?.recencyMinutes !== undefined
      ? Math.max(0, config.riskControls.cooldownMinutes - recentOrder.recencyMinutes)
      : undefined,
    executionBlockedReasons: buildExecutionBlockedReasons(config),
    holdReasons: []
  };
}

function buildPortfolioRiskSnapshot(portfolio: PortfolioSnapshot): PortfolioRiskSnapshot {
  const availableKrw = parseFiniteNumber(portfolio.availableKrw) ?? 0;
  const totalPositionValueKrw = portfolio.positions.reduce((sum, position) => sum + (parseFiniteNumber(position.positionValueKrw) ?? 0), 0);
  const openPositions = portfolio.positions.filter((position) => (parseFiniteNumber(position.heldQuantity) ?? 0) > 0).length;
  const portfolioValueKrw = availableKrw + totalPositionValueKrw;
  const portfolioExposurePct = portfolioValueKrw > 0 ? totalPositionValueKrw / portfolioValueKrw : undefined;

  return {
    openPositions,
    totalPositionValueKrw,
    portfolioValueKrw,
    portfolioExposurePct
  };
}

function buildExecutionBlockedReasons(config: AppConfig): string[] {
  const reasons: string[] = [];

  if (!config.enableLiveTrading) {
    reasons.push("ENABLE_LIVE_TRADING=false");
  }

  if (config.tradingKillSwitch) {
    reasons.push("TRADING_KILL_SWITCH=true");
  }

  reasons.push("Repository remains dry-run only until a guarded live order adapter is implemented.");
  return reasons;
}

function buildDailyTradeStats(
  quoteCurrency: string,
  completedOrders: CoinoneCompletedOrder[],
  now: Date = new Date()
): DailyTradeStats {
  const currentDay = now.toISOString().slice(0, 10);

  return completedOrders.reduce<DailyTradeStats>((accumulator, order) => {
    const pair = parsePair(order.pair);

    if (!pair || pair.quote !== quoteCurrency || formatUtcDay(order.completedAt) !== currentDay) {
      return accumulator;
    }

    accumulator.completedTradesToday += 1;

    if ((order.side ?? "").toLowerCase() === "buy") {
      const price = parseFiniteNumber(order.price);
      const quantity = parseFiniteNumber(order.qty);

      if (price !== undefined && quantity !== undefined) {
        accumulator.completedBuyValueTodayKrw += price * quantity;
      }
    }

    return accumulator;
  }, {
    completedTradesToday: 0,
    completedBuyValueTodayKrw: 0
  });
}

function resolveStrategyProfile(config: AppConfig, target: string): StrategyProfileName {
  return config.strategyProfileOverrides[target]
    ?? (config.stablecoinTargets.includes(target) ? "stablecoin" : config.defaultStrategyProfile);
}

function buildDecision(
  target: string,
  action: TradeDecision["action"],
  profileUsed: StrategyProfileName,
  reason: string,
  signal: DecisionSignalDetails,
  risk: DecisionRiskDetails,
  recommendedOrderValueKrw?: string,
  recommendedQuantity?: string
): TradeDecision {
  return {
    target,
    action,
    profileUsed,
    reason,
    recommendedOrderValueKrw,
    recommendedQuantity,
    signal,
    risk
  };
}

function holdDecision(
  target: string,
  profileUsed: StrategyProfileName,
  signal: DecisionSignalDetails,
  risk: DecisionRiskDetails,
  reason: string,
  holdDetail: string
): TradeDecision {
  return buildDecision(target, "hold", profileUsed, reason, signal, {
    ...risk,
    holdReasons: [...risk.holdReasons, holdDetail]
  });
}

function formatMarketSymbol(quoteCurrency: string, target: string): string {
  return `${target}-${quoteCurrency}`;
}

function selectTickers(targets: string[], tickers: CoinoneTicker[]): CoinoneTicker[] {
  const byTarget = new Map(tickers.map((ticker) => [ticker.target, ticker]));
  return targets.map((target) => byTarget.get(target)).filter((ticker): ticker is CoinoneTicker => ticker !== undefined);
}

function selectMarkPrice(ticker: CoinoneTicker | undefined): number | undefined {
  return selectNumericMarkPrice(ticker);
}

function selectNumericMarkPrice(ticker: CoinoneTicker | undefined): number | undefined {
  return parseFiniteNumber(ticker?.last) ?? parseFiniteNumber(ticker?.bestBidPrice) ?? parseFiniteNumber(ticker?.bestAskPrice);
}

function normalizeDecimal(value: string | undefined): string | undefined {
  const parsed = parseFiniteNumber(value);
  return parsed === undefined ? undefined : formatDecimal(parsed);
}

function normalizeAverageEntryPrice(value: string | undefined, heldQuantity: string): string | undefined {
  const parsedAverage = parseFiniteNumber(value);
  const parsedQuantity = parseFiniteNumber(heldQuantity) ?? 0;

  if (parsedAverage === undefined || parsedAverage <= 0 || parsedQuantity <= 0) {
    return undefined;
  }

  return formatDecimal(parsedAverage);
}

function parseFiniteNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeMultiply(left: string, right: number): number | undefined {
  const parsedLeft = parseFiniteNumber(left);
  return parsedLeft === undefined ? undefined : parsedLeft * right;
}

function floorQuantity(value: number): number {
  return Math.floor(value * 100_000_000) / 100_000_000;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(8).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2).replace(/\.00$/, "")}%`;
}

function parsePair(pair: string | undefined): { target: string; quote: string } | undefined {
  if (!pair) {
    return undefined;
  }

  const normalized = pair.includes("/") ? pair : pair.replace("-", "/");
  const [target, quote] = normalized.split("/");

  if (!target || !quote) {
    return undefined;
  }

  return {
    target: target.toUpperCase(),
    quote: quote.toUpperCase()
  };
}

function compareIsoTimes(left: string | undefined, right: string | undefined): number {
  return parseIsoTime(left) - parseIsoTime(right);
}

function parseIsoTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUtcDay(value: string | undefined): string | undefined {
  const parsed = parseIsoTime(value);

  if (parsed <= 0) {
    return undefined;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}
