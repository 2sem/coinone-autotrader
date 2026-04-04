import type { AppConfig } from "../config/env.js";
import {
  CoinoneCliAdapter,
  type CoinoneBalance,
  type CoinoneCompletedOrder,
  type CoinoneMarket,
  type CoinoneTicker
} from "../adapters/coinone-cli.js";

const COMPLETED_ORDER_LOOKBACK_DAYS = 30;
const COMPLETED_ORDER_HISTORY_SIZE = 100;

export interface AccountSnapshot {
  source: "live-cli" | "skipped";
  configured: boolean;
  balances: CoinoneBalance[];
  completedOrders: CoinoneCompletedOrder[];
  notes: string[];
}

export interface MarketSnapshot {
  source: "live-cli" | "mock";
  quoteCurrency: string;
  markets: CoinoneMarket[];
  tickers: CoinoneTicker[];
  rankedTargets: string[];
  notes: string[];
  account: AccountSnapshot;
}

export async function loadMarketSnapshot(config: AppConfig): Promise<MarketSnapshot> {
  if (config.marketDataMode === "mock") {
    return buildMockMarketSnapshot(config, ["MARKET_DATA_MODE=mock forces local fixture data."]);
  }

  try {
    return await loadLiveMarketSnapshot(config);
  } catch (error) {
    if (config.marketDataMode === "live") {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return buildMockMarketSnapshot(config, [`Live coinone CLI data unavailable: ${message}`]);
  }
}

async function loadLiveMarketSnapshot(config: AppConfig): Promise<MarketSnapshot> {
  const adapter = new CoinoneCliAdapter(config);
  const [markets, tickers] = await Promise.all([
    adapter.listMarkets(config.quoteCurrency),
    adapter.listTickers(config.quoteCurrency)
  ]);

  const rankedTargets = rankTargetsByQuoteVolume(tickers);
  const account = await loadAccountSnapshot(config, adapter);

  return {
    source: "live-cli",
    quoteCurrency: config.quoteCurrency,
    markets,
    tickers,
    rankedTargets,
    notes: [
      `Loaded ${markets.length} markets from coinone --json markets list.`,
      `Loaded ${tickers.length} tickers from coinone --json ticker list --quote ${config.quoteCurrency.toLowerCase()}.`
    ],
    account
  };
}

async function loadAccountSnapshot(config: AppConfig, adapter: CoinoneCliAdapter): Promise<AccountSnapshot> {
  if (!config.readAccountData) {
    return {
        source: "skipped",
        configured: false,
        balances: [],
        completedOrders: [],
        notes: ["READ_ACCOUNT_DATA=false keeps private read-only account calls disabled."]
      };
  }

  const authStatus = await adapter.getAuthStatus();

  if (!authStatus.configured) {
    return {
        source: "skipped",
        configured: false,
        balances: [],
        completedOrders: [],
        notes: [
          "Account reads requested, but Coinone credentials are not configured.",
          ...(authStatus.missing ?? []).map((entry) => `Missing ${entry}.`)
      ]
    };
  }

  const orderWindow = buildCompletedOrderWindow();
  const [balances, completedOrdersResult] = await Promise.all([
    adapter.listBalances(),
    adapter.listCompletedOrders({
      from: orderWindow.from,
      to: orderWindow.to,
      size: COMPLETED_ORDER_HISTORY_SIZE
    })
  ]);

  return {
    source: "live-cli",
    configured: true,
    balances,
    completedOrders: completedOrdersResult.orders,
    notes: [
      `Loaded ${balances.length} balances via coinone --json balances list.`,
      `Loaded ${completedOrdersResult.orders.length} completed orders from the last ${COMPLETED_ORDER_LOOKBACK_DAYS} days via coinone --json orders completed.`
    ]
  };
}

function buildMockMarketSnapshot(config: AppConfig, notes: string[]): MarketSnapshot {
  const targets = buildMockTargets(config);
  const markets = targets.map((target, index) => ({
    pair: `${target}/${config.quoteCurrency}`,
    target,
    quote: config.quoteCurrency,
    qtyUnit: "0.00000001",
    minOrderAmount: "5000.0",
    maxOrderAmount: "1000000000.0",
    tradeStatus: 1,
    maintenanceStatus: 0,
    orderTypes: ["limit", "market"]
  }));

  const tickers = targets.map((target, index) => {
    const basePrice = mockBasePrice(target, index);

    return {
      pair: `${target}/${config.quoteCurrency}`,
      target,
      quote: config.quoteCurrency,
      timestamp: 1_775_206_000_000 + index * 1_000,
      isoTime: new Date(1_775_206_000_000 + index * 1_000).toISOString(),
      last: formatDecimal(basePrice),
      high: formatDecimal(scalePrice(basePrice, 102, 100)),
      low: formatDecimal(scalePrice(basePrice, 98, 100)),
      quoteVolume: formatDecimal(1_000_000_000 - index * 50_000_000),
      targetVolume: formatDecimal(10_000 - index * 250),
      bestAskPrice: formatDecimal(scalePrice(basePrice, 1001, 1000)),
      bestBidPrice: formatDecimal(scalePrice(basePrice, 999, 1000))
    };
  });

  return {
    source: "mock",
    quoteCurrency: config.quoteCurrency,
    markets,
    tickers,
    rankedTargets: targets,
    notes: [...notes, `Generated ${targets.length} local mock markets for dry-run safety.`],
    account: {
      source: "skipped",
      configured: false,
      balances: [],
      completedOrders: [],
      notes: ["Mock mode does not call private account endpoints."]
    }
  };
}

function buildCompletedOrderWindow(now: Date = new Date()): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - COMPLETED_ORDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
    to: now
  };
}

function buildMockTargets(config: AppConfig): string[] {
  const ordered = [
    ...config.tradeTargets,
    ...config.autoSelectionUniverse,
    "BTC",
    "ETH",
    "XRP",
    "SOL"
  ];

  return Array.from(new Set(ordered.filter(Boolean)));
}

function rankTargetsByQuoteVolume(tickers: CoinoneTicker[]): string[] {
  return tickers
    .slice()
    .sort((left, right) => parseNumeric(right.quoteVolume) - parseNumeric(left.quoteVolume))
    .map((ticker) => ticker.target);
}

function mockBasePrice(target: string, index: number): number {
  const seeds: Record<string, number> = {
    BTC: 101_000_000,
    ETH: 4_800_000,
    XRP: 1_000,
    SOL: 220_000
  };

  return seeds[target] ?? 10_000 + index * 2_500;
}

function parseNumeric(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(8).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function scalePrice(value: number, numerator: number, denominator: number): number {
  return Math.round((value * numerator * 100_000_000) / denominator) / 100_000_000;
}
