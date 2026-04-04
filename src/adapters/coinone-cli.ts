import { execFile } from "node:child_process";
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
}

function buildExecutable(cliPath: string, args: string[], baseUrl?: string): { command: string; commandArgs: string[] } {
  const commonArgs = ["--json"];

  if (baseUrl) {
    commonArgs.push("--base-url", baseUrl);
  }

  if (cliPath.endsWith(".js")) {
    return {
      command: process.execPath,
      commandArgs: [cliPath, ...commonArgs, ...args]
    };
  }

  return {
    command: cliPath,
    commandArgs: [...commonArgs, ...args]
  };
}

function resolveDefaultCliPath(): string {
  const vendorCliPath = path.resolve(process.cwd(), ".vendor", "coinone-api-cli", "dist", "bin", "coinone.js");
  return existsSync(vendorCliPath) ? vendorCliPath : "coinone";
}
