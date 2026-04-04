import type { AppConfig } from "../config/env.js";
import { loadMarketSnapshot } from "../trading/market-data.js";
import { resolveSelectionPlan } from "../trading/selection.js";
import {
  type AgentCompletedOrderSnapshot,
  type AgentMarketDecisionSnapshot,
  type AgentPositionSnapshot,
  validateAgentMarketDecisionSnapshot
} from "./contracts.js";

export async function buildAgentMarketDecisionSnapshot(config: AppConfig): Promise<AgentMarketDecisionSnapshot> {
  const marketSnapshot = await loadMarketSnapshot(config);
  const selectionPlan = resolveSelectionPlan(config, {
    availableTargets: marketSnapshot.markets.map((market) => market.target),
    rankedTargets: marketSnapshot.rankedTargets
  });
  const tickerByTarget = new Map(marketSnapshot.tickers.map((ticker) => [ticker.target, ticker]));
  const balanceByCurrency = new Map(marketSnapshot.account.balances.map((balance) => [balance.currency, balance]));
  const createdAt = new Date().toISOString();
  const snapshot: AgentMarketDecisionSnapshot = {
    schemaVersion: "1",
    snapshotId: buildRunId("snapshot", createdAt),
    createdAt,
    dryRun: config.dryRun,
    liveTradingEnabled: config.enableLiveTrading,
    liveTradingBlocked: !config.enableLiveTrading || config.tradingKillSwitch,
    source: marketSnapshot.source,
    provider: config.agentDecisionProvider,
    quoteCurrency: config.quoteCurrency,
    selectionMode: selectionPlan.mode,
    selectedTargets: selectionPlan.targets,
    excludedTargets: selectionPlan.excludedTargets,
    rankedTargets: marketSnapshot.rankedTargets,
    availableMarketCount: marketSnapshot.markets.length,
    tickers: selectionPlan.targets.map((target) => {
      const ticker = tickerByTarget.get(target);
      return {
        pair: ticker?.pair ?? `${target}/${config.quoteCurrency}`,
        target,
        last: ticker?.last,
        bestBidPrice: ticker?.bestBidPrice,
        bestAskPrice: ticker?.bestAskPrice,
        quoteVolume: ticker?.quoteVolume
      };
    }),
    account: {
      source: marketSnapshot.account.source,
      configured: marketSnapshot.account.configured,
      balances: marketSnapshot.account.balances.map((balance) => ({
        currency: balance.currency,
        available: balance.available,
        locked: balance.locked,
        averagePrice: balance.averagePrice
      })),
      completedOrders: marketSnapshot.account.completedOrders.map<AgentCompletedOrderSnapshot>((order) => ({
        tradeId: order.tradeId,
        orderId: order.orderId,
        pair: order.pair,
        side: order.side,
        price: order.price,
        qty: order.qty,
        completedAt: order.completedAt
      }))
    },
    portfolio: {
      availableQuoteBalance: balanceByCurrency.get(config.quoteCurrency)?.available,
      positions: selectionPlan.targets.map<AgentPositionSnapshot>((target) => {
        const ticker = tickerByTarget.get(target);
        const balance = balanceByCurrency.get(target);
        const heldQuantity = normalizeDecimal(balance?.available) ?? "0";
        const markPrice = ticker?.last;
        const positionValueQuote = markPrice ? multiplyDecimals(heldQuantity, markPrice) : undefined;

        return {
          target,
          pair: ticker?.pair ?? `${target}/${config.quoteCurrency}`,
          heldQuantity,
          averageEntryPrice: normalizeDecimal(balance?.averagePrice),
          markPrice: normalizeDecimal(markPrice),
          positionValueQuote
        };
      })
    },
    notes: [
      ...marketSnapshot.notes,
      ...selectionPlan.notes,
      ...marketSnapshot.account.notes,
      "Snapshot is normalized for the agent-decision dry-run workflow.",
      "Live order placement remains disabled; this snapshot is for read-only reasoning only."
    ]
  };

  return validateAgentMarketDecisionSnapshot(snapshot);
}

export function buildRunId(prefix: string, timestamp: string): string {
  return `${prefix}-${timestamp.replace(/[:.]/g, "-")}`;
}

function normalizeDecimal(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(8).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function multiplyDecimals(left: string, right: string): string | undefined {
  const leftValue = Number(left);
  const rightValue = Number(right);

  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
    return undefined;
  }

  const result = leftValue * rightValue;
  return Number.isInteger(result) ? String(result) : result.toFixed(8).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
