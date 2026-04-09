import type { CoinoneMarket } from "../adapters/coinone-cli.js";
import type { ExecutionPreviewOrderPayload } from "./contracts.js";

export interface NormalizedOrderResult {
  normalizedOrder?: ExecutionPreviewOrderPayload;
  failureReason?: string;
}

export function normalizeOrderForMarket(
  order: ExecutionPreviewOrderPayload,
  market: CoinoneMarket | undefined
): NormalizedOrderResult {
  if (!market) {
    return { failureReason: `Market metadata not found for ${order.pair}.` };
  }

  if (market.tradeStatus !== undefined && market.tradeStatus !== 1) {
    return { failureReason: `${order.pair} tradeStatus=${market.tradeStatus}.` };
  }

  if (market.maintenanceStatus !== undefined && market.maintenanceStatus !== 0) {
    return { failureReason: `${order.pair} maintenanceStatus=${market.maintenanceStatus}.` };
  }

  if (market.orderTypes && !market.orderTypes.map((entry) => entry.toLowerCase()).includes("limit")) {
    return { failureReason: `${order.pair} does not allow limit orders.` };
  }

  const normalizedPrice = normalizePrice(order.price);
  const normalizedQuantity = normalizeQuantity(order.quantity, market.qtyUnit);

  if (!normalizedPrice || !normalizedQuantity) {
    return { failureReason: `Unable to normalize price or quantity for ${order.pair}.` };
  }

  const orderValue = Number(normalizedPrice) * Number(normalizedQuantity);
  const minOrderAmount = Number(market.minOrderAmount);

  if (Number.isFinite(minOrderAmount) && orderValue < minOrderAmount) {
    return { failureReason: `Order value ${formatNumber(orderValue)} is below minOrderAmount=${market.minOrderAmount}.` };
  }

  return {
    normalizedOrder: {
      ...order,
      price: normalizedPrice,
      quantity: normalizedQuantity,
      value: formatNumber(orderValue)
    }
  };
}

function normalizePrice(price: string): string | undefined {
  const parsed = Number(price);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(8).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function normalizeQuantity(quantity: string, qtyUnit: string | undefined): string | undefined {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  if (!qtyUnit) {
    return formatNumber(parsed);
  }

  const step = Number(qtyUnit);
  if (!Number.isFinite(step) || step <= 0) {
    return formatNumber(parsed);
  }

  const normalized = Math.floor(parsed / step) * step;
  if (normalized <= 0) {
    return undefined;
  }

  return formatNumber(normalized);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(8).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
