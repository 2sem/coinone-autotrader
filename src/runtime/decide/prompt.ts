import type { AppConfig } from "../../config/env.js";
import type { RuntimeAnalysis, RuntimeSnapshot } from "../contracts/index.js";

export function buildDecisionPrompt(snapshot: RuntimeSnapshot, analysis: RuntimeAnalysis, config: AppConfig): string {
  return [
    "You are the final trading decision agent.",
    "Use the provided runtime snapshot and analysis to return one final action: buy, sell, or hold.",
    "Prefer hold when confidence is low or account context is incomplete.",
    "Use split buying/selling as the default execution style when actionable.",
    "Do not ignore current balances, holdings, completed orders, and conservative risk controls.",
    `Risk profile: ${config.riskProfile}.`,
    `Selection mode: ${snapshot.market.selectedTargets.join(", ") || "none"}.`,
    `Analysis summary: ${analysis.analysisSummaryEn}`
  ].join(" ");
}
