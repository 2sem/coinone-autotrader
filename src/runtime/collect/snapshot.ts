import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "../../config/env.js";
import { buildRunId } from "../../agent/snapshot.js";
import { CoinoneCliAdapter } from "../../adapters/coinone-cli.js";
import { loadMarketSnapshot } from "../../trading/market-data.js";
import { resolveSelectionPlan } from "../../trading/selection.js";
import { validateRuntimeSnapshot, type RuntimeSnapshot } from "../contracts/index.js";

const DEFAULT_OUTPUT_DIR = "artifacts/runtime";

export async function collectRuntimeSnapshot(config: AppConfig): Promise<RuntimeSnapshot> {
  const marketSnapshot = await loadMarketSnapshot(config);
  const cliAdapter = new CoinoneCliAdapter(config);
  const selectionPlan = resolveSelectionPlan(config, {
    availableTargets: marketSnapshot.markets.map((market) => market.target),
    rankedTargets: marketSnapshot.rankedTargets
  });
  const tickerByTarget = new Map(marketSnapshot.tickers.map((ticker) => [ticker.target, ticker]));
  const balanceByCurrency = new Map(marketSnapshot.account.balances.map((balance) => [balance.currency, balance]));
  const completedOrdersByTarget = new Map<string, string>();

  for (const order of marketSnapshot.account.completedOrders) {
    const target = parseTargetFromPair(order.pair);
    if (!target || !order.completedAt) {
      continue;
    }

    const currentLatest = completedOrdersByTarget.get(target);

    if (!currentLatest || Date.parse(order.completedAt) > Date.parse(currentLatest)) {
      completedOrdersByTarget.set(target, order.completedAt);
    }
  }

  const createdAt = new Date().toISOString();
  const fees = await Promise.all(
    selectionPlan.targets.map(async (target) => {
      try {
        return await cliAdapter.getFee({ quoteCurrency: config.quoteCurrency, targetCurrency: target });
      } catch (error) {
        return {
          pair: `${target}/${config.quoteCurrency}`,
          quote: config.quoteCurrency,
          target,
          source: "unavailable" as const,
          makerFeeBps: undefined,
          takerFeeBps: undefined
        };
      }
    })
  );

  return validateRuntimeSnapshot({
    schemaVersion: "1",
    snapshotId: buildRunId("runtime-snapshot", createdAt),
    createdAt,
    market: {
      mode: config.marketDataMode,
      source: marketSnapshot.source,
      quoteCurrency: config.quoteCurrency,
      selectedTargets: selectionPlan.targets,
      tickers: selectionPlan.targets.map((target) => {
        const ticker = tickerByTarget.get(target);
        return {
          target,
          pair: ticker?.pair ?? `${target}/${config.quoteCurrency}`,
          last: ticker?.last,
          bestBidPrice: ticker?.bestBidPrice,
          bestAskPrice: ticker?.bestAskPrice,
          quoteVolume: ticker?.quoteVolume
        };
      }),
      notes: [...marketSnapshot.notes, ...selectionPlan.notes]
    },
    account: {
      source: marketSnapshot.account.source,
      configured: marketSnapshot.account.configured,
      availableKrw: balanceByCurrency.get(config.quoteCurrency)?.available,
      balances: marketSnapshot.account.balances as unknown as Array<Record<string, unknown>>,
      completedOrders: marketSnapshot.account.completedOrders as unknown as Array<Record<string, unknown>>,
      notes: marketSnapshot.account.notes
    },
    portfolio: {
      positions: selectionPlan.targets.map((target) => {
        const ticker = tickerByTarget.get(target);
        const balance = balanceByCurrency.get(target);
        const heldQuantity = normalizeDecimal(balance?.available) ?? "0";
        const markPrice = normalizeDecimal(ticker?.last);
        return {
          target,
          pair: ticker?.pair ?? `${target}/${config.quoteCurrency}`,
          heldQuantity,
          averageEntryPrice: normalizeAverageEntryPrice(balance?.averagePrice, heldQuantity),
          markPrice,
          positionValueKrw: markPrice ? multiplyDecimals(heldQuantity, markPrice) : undefined,
          recentOrderAt: completedOrdersByTarget.get(target)
        };
      })
    },
    fees
  });
}

export async function writeRuntimeSnapshot(snapshot: RuntimeSnapshot, outputDir = DEFAULT_OUTPUT_DIR): Promise<{ latestPath: string; datedPath: string }> {
  const snapshotDir = path.resolve(outputDir, "snapshots");
  await mkdir(snapshotDir, { recursive: true });

  const fileName = `${snapshot.createdAt.replace(/[:.]/g, "-")}.json`;
  const latestPath = path.join(snapshotDir, "latest.json");
  const datedPath = path.join(snapshotDir, fileName);

  await Promise.all([writeJson(latestPath, snapshot), writeJson(datedPath, snapshot)]);
  return { latestPath, datedPath };
}

export async function readLatestRuntimeSnapshot(outputDir = DEFAULT_OUTPUT_DIR): Promise<RuntimeSnapshot> {
  const latestPath = path.resolve(outputDir, "snapshots", "latest.json");
  const raw = await readFile(latestPath, "utf8");
  return validateRuntimeSnapshot(JSON.parse(raw));
}

function parseTargetFromPair(pair: string | undefined): string | undefined {
  if (!pair) {
    return undefined;
  }

  const [target] = pair.split("/");
  return target?.trim().toUpperCase() || undefined;
}

function normalizeDecimal(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(8).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function normalizeAverageEntryPrice(value: string | undefined, heldQuantity: string): string | undefined {
  const parsedAverage = value ? Number(value) : undefined;
  const parsedQuantity = Number(heldQuantity);

  if (!Number.isFinite(parsedAverage) || !Number.isFinite(parsedQuantity) || (parsedAverage ?? 0) <= 0 || parsedQuantity <= 0) {
    return undefined;
  }

  return normalizeDecimal(value);
}

function multiplyDecimals(left: string, right: string): string | undefined {
  const leftValue = Number(left);
  const rightValue = Number(right);

  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
    return undefined;
  }

  return normalizeDecimal(String(leftValue * rightValue));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
