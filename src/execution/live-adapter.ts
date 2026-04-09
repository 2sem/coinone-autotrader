import type { ExecutionPreviewOrderPayload } from "./contracts.js";

export interface LiveSubmitResult {
  submitted: boolean;
  orderId?: string | null;
  submittedAt?: string | null;
  rawResponse: unknown;
  failureReason?: string;
}

export interface LiveOrderAdapter {
  readonly name: "coinone-live";
  submitLimitOrder(order: ExecutionPreviewOrderPayload): Promise<LiveSubmitResult>;
}
