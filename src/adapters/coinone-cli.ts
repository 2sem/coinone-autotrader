import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type { AppConfig } from "../config/env.js";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 15_000;

export interface CoinoneMarket {
  pair: string;
  target: string;
  quote: string;
  qtyUnit?: string;
  minOrderAmount?: string;
  maxOrderAmount?: string;
  tradeStatus?: number;
  maintenanceStatus?: number;
  orderTypes?: string[];
}

export interface CoinoneTicker {
  pair: string;
  target: string;
  quote: string;
  timestamp?: number;
  isoTime?: string;
  last?: string;
  high?: string;
  low?: string;
  quoteVolume?: string;
  targetVolume?: string;
  bestAskPrice?: string;
  bestBidPrice?: string;
}

export interface CoinoneAuthStatus {
  configured: boolean;
  accessTokenConfigured?: boolean;
  secretKeyConfigured?: boolean;
  missing?: string[];
}

export interface CoinoneBalance {
  currency: string;
  available?: string;
  locked?: string;
  averagePrice?: string;
}

export interface CoinoneCompletedOrder {
  tradeId?: string;
  orderId?: string;
  userOrderId?: string;
  pair?: string;
  side?: string;
  orderType?: string;
  price?: string;
  qty?: string;
  fee?: string;
  feeCurrency?: string;
  completedAt?: string;
}

export interface CoinoneCompletedOrdersResult {
  fromTs: number;
  toTs: number;
  from: string;
  to: string;
  size: number;
  toTradeId?: string;
  pair?: string;
  orders: CoinoneCompletedOrder[];
}

export interface CoinonePlacedOrderResult {
  action?: string;
  submitted?: boolean;
  orderId?: string | null;
  pair?: string;
  side?: string;
  orderType?: string;
  price?: string;
  qty?: string;
  postOnly?: boolean;
  userOrderId?: string | null;
  submittedAt?: string | null;
}

export interface CoinoneFeeInfo {
  pair: string;
  quote: string;
  target: string;
  makerFeeBps?: number;
  takerFeeBps?: number;
  source: "fees-get";
}

export class CoinoneCliAdapter {
  private readonly cliPath: string;
  private readonly timeoutMs: number;
  private readonly baseUrl?: string;

  constructor(config: Pick<AppConfig, "coinoneCliPath" | "coinoneCliTimeoutMs" | "coinoneCliBaseUrl">) {
    this.cliPath = config.coinoneCliPath ?? resolveDefaultCliPath();
    this.timeoutMs = config.coinoneCliTimeoutMs || DEFAULT_TIMEOUT_MS;
    this.baseUrl = config.coinoneCliBaseUrl;
  }

  async listMarkets(quoteCurrency: string): Promise<CoinoneMarket[]> {
    const args = quoteCurrency === "KRW" ? ["markets", "list"] : ["markets", "list", "--quote", quoteCurrency.toLowerCase()];
    return this.runJsonCommand<CoinoneMarket[]>(args);
  }

  async getMarket(quoteCurrency: string, targetCurrency: string): Promise<CoinoneMarket | undefined> {
    const markets = await this.listMarkets(quoteCurrency);
    return markets.find(
      (market) => market.quote.toUpperCase() === quoteCurrency.toUpperCase() && market.target.toUpperCase() === targetCurrency.toUpperCase()
    );
  }

  async getFee(input: { quoteCurrency: string; targetCurrency: string }): Promise<CoinoneFeeInfo> {
    const response = await this.runJsonCommandTrailingJson<Record<string, unknown>>([
      "fees",
      "get",
      "--quote",
      input.quoteCurrency.toLowerCase(),
      "--target",
      input.targetCurrency.toLowerCase()
    ]);

    return {
      pair: `${input.targetCurrency.toUpperCase()}/${input.quoteCurrency.toUpperCase()}`,
      quote: input.quoteCurrency.toUpperCase(),
      target: input.targetCurrency.toUpperCase(),
      makerFeeBps: parseFeeBps(response.makerFeeRate ?? response.maker_fee_rate ?? response.makerFee ?? response.maker_fee),
      takerFeeBps: parseFeeBps(response.takerFeeRate ?? response.taker_fee_rate ?? response.takerFee ?? response.taker_fee),
      source: "fees-get"
    };
  }

  async listTickers(quoteCurrency: string): Promise<CoinoneTicker[]> {
    return this.runJsonCommand<CoinoneTicker[]>(["ticker", "list", "--quote", quoteCurrency.toLowerCase()]);
  }

  async getAuthStatus(): Promise<CoinoneAuthStatus> {
    return this.runJsonCommand<CoinoneAuthStatus>(["auth", "status"]);
  }

  async listBalances(): Promise<CoinoneBalance[]> {
    return this.runJsonCommand<CoinoneBalance[]>(["balances", "list"]);
  }

  async listCompletedOrders(input: {
    from: Date;
    to: Date;
    size?: number;
    quoteCurrency?: string;
    targetCurrency?: string;
  }): Promise<CoinoneCompletedOrdersResult> {
    const args = [
      "orders",
      "completed",
      "--from",
      input.from.toISOString(),
      "--to",
      input.to.toISOString(),
      "--size",
      String(input.size ?? 100)
    ];

    if (input.quoteCurrency && input.targetCurrency) {
      args.push("--quote", input.quoteCurrency.toLowerCase(), "--target", input.targetCurrency.toLowerCase());
    }

    return this.runJsonCommand<CoinoneCompletedOrdersResult>(args);
  }

  async placeLimitOrder(input: {
    quoteCurrency: string;
    targetCurrency: string;
    side: "buy" | "sell";
    price: string;
    qty: string;
    postOnly?: boolean;
    userOrderId?: string;
  }): Promise<CoinonePlacedOrderResult> {
    const args = [
      "orders",
      "place",
      "--quote",
      input.quoteCurrency.toLowerCase(),
      "--target",
      input.targetCurrency.toLowerCase(),
      "--side",
      input.side,
      "--type",
      "limit",
      "--price",
      input.price,
      "--qty",
      input.qty,
      "--confirm",
      "live"
    ];

    if (input.postOnly) {
      args.push("--post-only");
    }

    if (input.userOrderId) {
      args.push("--user-order-id", input.userOrderId);
    }

    return this.runJsonCommand<CoinonePlacedOrderResult>(args);
  }

  private async runJsonCommand<T>(args: string[]): Promise<T> {
    const { command, commandArgs } = buildExecutable(this.cliPath, args, this.baseUrl);
    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      timeout: this.timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env
    });

    if (stderr.trim() !== "") {
      throw new Error(stderr.trim());
    }

    try {
      return JSON.parse(stdout) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse coinone CLI JSON output: ${message}`);
    }
  }

  private async runJsonCommandTrailingJson<T>(args: string[]): Promise<T> {
    const { command, commandArgs } = buildExecutable(this.cliPath, args, this.baseUrl, "trailing");
    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      timeout: this.timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env
    });

    if (stderr.trim() !== "") {
      throw new Error(stderr.trim());
    }

    try {
      return JSON.parse(stdout) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse coinone CLI JSON output: ${message}`);
    }
  }
}

function parseFeeBps(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  if (parsed > 0 && parsed < 1) {
    return parsed * 10000;
  }

  return parsed;
}

function buildExecutable(
  cliPath: string,
  args: string[],
  baseUrl?: string,
  jsonPosition: "leading" | "trailing" = "leading"
): { command: string; commandArgs: string[] } {
  const commonArgs = ["--json"];
  const finalArgs = jsonPosition === "leading" ? [...commonArgs, ...args] : [...args, ...commonArgs];

  if (baseUrl) {
    if (jsonPosition === "leading") {
      finalArgs.splice(1, 0, "--base-url", baseUrl);
    } else {
      finalArgs.push("--base-url", baseUrl);
    }
  }

  if (cliPath.endsWith(".js")) {
    return {
      command: process.execPath,
      commandArgs: [cliPath, ...finalArgs]
    };
  }

  return {
    command: cliPath,
    commandArgs: finalArgs
  };
}

function resolveDefaultCliPath(): string {
  const systemCliPath = resolveSystemCoinonePath();
  if (systemCliPath) {
    return systemCliPath;
  }

  const vendorCliPath = path.resolve(process.cwd(), ".vendor", "coinone-api-cli", "dist", "bin", "coinone.js");
  return existsSync(vendorCliPath) ? vendorCliPath : "coinone";
}

function resolveSystemCoinonePath(): string | undefined {
  try {
    const stdout = execFileSync("which", ["coinone"], {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    return stdout.length > 0 ? stdout : undefined;
  } catch {
    return undefined;
  }
}
