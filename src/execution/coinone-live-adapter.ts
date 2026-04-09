import type { AppConfig } from "../config/env.js";
import { CoinoneCliAdapter } from "../adapters/coinone-cli.js";
import type { ExecutionPreviewOrderPayload } from "./contracts.js";
import type { LiveOrderAdapter, LiveSubmitResult } from "./live-adapter.js";

export class CoinoneLiveOrderAdapter implements LiveOrderAdapter {
  readonly name = "coinone-live" as const;
  private readonly adapter: CoinoneCliAdapter;

  constructor(config: Pick<AppConfig, "coinoneCliPath" | "coinoneCliTimeoutMs" | "coinoneCliBaseUrl">) {
    this.adapter = new CoinoneCliAdapter(config);
  }

  async submitLimitOrder(order: ExecutionPreviewOrderPayload): Promise<LiveSubmitResult> {
    const [targetCurrency, quoteCurrency] = order.pair.split("/");
    if (!targetCurrency || !quoteCurrency) {
      return {
        submitted: false,
        rawResponse: { pair: order.pair },
        failureReason: `Invalid pair format: ${order.pair}`
      };
    }

    try {
      const response = await this.adapter.placeLimitOrder({
        quoteCurrency,
        targetCurrency,
        side: order.side === "BUY" ? "buy" : "sell",
        price: order.price,
        qty: order.quantity
      });

      return {
        submitted: response.submitted === true,
        orderId: response.orderId,
        submittedAt: response.submittedAt,
        rawResponse: response,
        failureReason: response.submitted === true ? undefined : "Coinone CLI returned submitted=false."
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        submitted: false,
        rawResponse: { error: message },
        failureReason: message
      };
    }
  }
}
