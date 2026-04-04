import { config as loadDotEnv } from "dotenv";

loadDotEnv();

export type SelectionMode = "allowlist" | "auto";
export type MarketDataMode = "auto" | "live" | "mock";
export type StrategyProfileName = "default" | "stablecoin";
export type RiskProfileName = "conservative" | "balanced" | "aggressive";

export interface AppConfig {
  dryRun: boolean;
  enableLiveTrading: boolean;
  tradingKillSwitch: boolean;
  executionApprovalWindowSeconds: number;
  quoteCurrency: string;
  marketDataMode: MarketDataMode;
  coinoneCliPath?: string;
  coinoneCliTimeoutMs: number;
  coinoneCliBaseUrl?: string;
  selectionMode: SelectionMode;
  riskProfile: RiskProfileName;
  tradeTargets: string[];
  autoSelectionUniverse: string[];
  maxSelectedAssets: number;
  excludedTargets: string[];
  defaultStrategyProfile: StrategyProfileName;
  stablecoinTargets: string[];
  strategyProfileOverrides: Record<string, StrategyProfileName>;
  riskControls: RiskControls;
  agentDecisionProvider: AgentDecisionProviderName;
  agentDecisionOutputDir: string;
  executionPreviewOutputDir: string;
  agentProviderRuntime: AgentProviderRuntimeConfig;
  slackWebhookUrl?: string;
  slackNotificationPolicy: SlackNotificationPolicy;
  githubToken?: string;
  githubRepository?: GitHubRepository;
  githubApiBaseUrl: string;
  githubCreateIssues: boolean;
  reportOutputDir: string;
}

export type AgentDecisionProviderName = "mock" | "openai-compatible";

export interface AgentProviderRuntimeConfig {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  promptVersion: string;
  temperature?: number;
  timeoutMs: number;
  fallbackToMock: boolean;
}

export interface RiskControls {
  maxOrderKrw: number;
  maxPositionPerAssetKrw: number;
  minCashReserveKrw: number;
  cooldownMinutes: number;
  buyFractionOfCash: number;
  sellFractionOfPosition: number;
  maxDailyBuyKrw: number;
  maxTradesPerDay: number;
  maxOpenPositions: number;
  maxPortfolioExposurePct: number;
}

const RISK_PROFILE_DEFAULTS: Record<RiskProfileName, RiskControls> = {
  conservative: {
    maxOrderKrw: 50_000,
    maxPositionPerAssetKrw: 150_000,
    minCashReserveKrw: 200_000,
    cooldownMinutes: 360,
    buyFractionOfCash: 0.1,
    sellFractionOfPosition: 0.25,
    maxDailyBuyKrw: 100_000,
    maxTradesPerDay: 1,
    maxOpenPositions: 2,
    maxPortfolioExposurePct: 0.3
  },
  balanced: {
    maxOrderKrw: 100_000,
    maxPositionPerAssetKrw: 250_000,
    minCashReserveKrw: 100_000,
    cooldownMinutes: 180,
    buyFractionOfCash: 0.25,
    sellFractionOfPosition: 0.5,
    maxDailyBuyKrw: 200_000,
    maxTradesPerDay: 2,
    maxOpenPositions: 3,
    maxPortfolioExposurePct: 0.5
  },
  aggressive: {
    maxOrderKrw: 200_000,
    maxPositionPerAssetKrw: 400_000,
    minCashReserveKrw: 50_000,
    cooldownMinutes: 60,
    buyFractionOfCash: 0.4,
    sellFractionOfPosition: 0.75,
    maxDailyBuyKrw: 400_000,
    maxTradesPerDay: 4,
    maxOpenPositions: 5,
    maxPortfolioExposurePct: 0.7
  }
};

export interface SlackNotificationPolicy {
  routinePreview: boolean;
  routineDryRun: boolean;
  approvalNeeded: boolean;
  actionNeeded: boolean;
  dailyReport: boolean;
  monthlyReport: boolean;
  liveSubmit: boolean;
}

export interface GitHubRepository {
  owner: string;
  name: string;
  fullName: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const selectionMode = parseSelectionMode(env.SELECTION_MODE);
  const riskProfile = parseRiskProfile(env.RISK_PROFILE);
  const profileDefaults = RISK_PROFILE_DEFAULTS[riskProfile];

  return {
    dryRun: parseBoolean(env.DRY_RUN, true),
    enableLiveTrading: parseBoolean(env.ENABLE_LIVE_TRADING, false),
    tradingKillSwitch: parseBoolean(env.TRADING_KILL_SWITCH, false),
    executionApprovalWindowSeconds: parsePositiveInteger(
      env.EXECUTION_APPROVAL_WINDOW_SECONDS,
      300,
      "EXECUTION_APPROVAL_WINDOW_SECONDS"
    ),
    quoteCurrency: parseAssetSymbol(env.QUOTE_CURRENCY ?? "KRW", "QUOTE_CURRENCY"),
    marketDataMode: parseMarketDataMode(env.MARKET_DATA_MODE),
    coinoneCliPath: optionalString(env.COINONE_CLI_PATH),
    coinoneCliTimeoutMs: parsePositiveInteger(env.COINONE_CLI_TIMEOUT_MS, 15000, "COINONE_CLI_TIMEOUT_MS"),
    coinoneCliBaseUrl: optionalString(env.COINONE_CLI_BASE_URL),
    selectionMode,
    riskProfile,
    tradeTargets: parseAssetList(env.TRADE_TARGETS),
    autoSelectionUniverse: parseAssetList(env.AUTO_SELECTION_UNIVERSE),
    maxSelectedAssets: parsePositiveInteger(env.MAX_SELECTED_ASSETS, 5, "MAX_SELECTED_ASSETS"),
    excludedTargets: parseAssetList(env.EXCLUDED_TARGETS),
    defaultStrategyProfile: parseStrategyProfile(env.DEFAULT_STRATEGY_PROFILE, "DEFAULT_STRATEGY_PROFILE", "default"),
    stablecoinTargets: parseAssetList(env.STABLECOIN_TARGETS).length > 0 ? parseAssetList(env.STABLECOIN_TARGETS) : ["USDC", "USDT"],
    strategyProfileOverrides: parseStrategyProfileOverrides(env.STRATEGY_PROFILE_OVERRIDES),
    riskControls: {
      maxOrderKrw: parsePositiveNumber(env.MAX_ORDER_KRW, profileDefaults.maxOrderKrw, "MAX_ORDER_KRW"),
      maxPositionPerAssetKrw: parsePositiveNumber(
        env.MAX_POSITION_PER_ASSET_KRW,
        profileDefaults.maxPositionPerAssetKrw,
        "MAX_POSITION_PER_ASSET_KRW"
      ),
      minCashReserveKrw: parseNonNegativeNumber(env.MIN_CASH_RESERVE_KRW, profileDefaults.minCashReserveKrw, "MIN_CASH_RESERVE_KRW"),
      cooldownMinutes: parsePositiveInteger(env.COOLDOWN_MINUTES, profileDefaults.cooldownMinutes, "COOLDOWN_MINUTES"),
      buyFractionOfCash: parseFraction(env.BUY_FRACTION_OF_CASH, profileDefaults.buyFractionOfCash, "BUY_FRACTION_OF_CASH"),
      sellFractionOfPosition: parseFraction(env.SELL_FRACTION_OF_POSITION, profileDefaults.sellFractionOfPosition, "SELL_FRACTION_OF_POSITION"),
      maxDailyBuyKrw: parsePositiveNumber(env.MAX_DAILY_BUY_KRW, profileDefaults.maxDailyBuyKrw, "MAX_DAILY_BUY_KRW"),
      maxTradesPerDay: parsePositiveInteger(env.MAX_TRADES_PER_DAY, profileDefaults.maxTradesPerDay, "MAX_TRADES_PER_DAY"),
      maxOpenPositions: parsePositiveInteger(env.MAX_OPEN_POSITIONS, profileDefaults.maxOpenPositions, "MAX_OPEN_POSITIONS"),
      maxPortfolioExposurePct: parseFraction(env.MAX_PORTFOLIO_EXPOSURE_PCT, profileDefaults.maxPortfolioExposurePct, "MAX_PORTFOLIO_EXPOSURE_PCT")
    },
    agentDecisionProvider: parseAgentDecisionProvider(env.AGENT_DECISION_PROVIDER),
    agentDecisionOutputDir: optionalString(env.AGENT_DECISION_OUTPUT_DIR) ?? "artifacts/agent-decision",
    executionPreviewOutputDir: optionalString(env.EXECUTION_PREVIEW_OUTPUT_DIR) ?? "artifacts/execution-preview",
    agentProviderRuntime: {
      endpoint: parseOptionalUrl(env.AGENT_PROVIDER_ENDPOINT, "AGENT_PROVIDER_ENDPOINT"),
      apiKey: optionalString(env.AGENT_PROVIDER_API_KEY),
      model: optionalString(env.AGENT_PROVIDER_MODEL),
      promptVersion: optionalString(env.AGENT_PROVIDER_PROMPT_VERSION) ?? "phase-4",
      temperature: parseOptionalTemperature(env.AGENT_PROVIDER_TEMPERATURE, "AGENT_PROVIDER_TEMPERATURE"),
      timeoutMs: parsePositiveInteger(env.AGENT_PROVIDER_TIMEOUT_MS, 20000, "AGENT_PROVIDER_TIMEOUT_MS"),
      fallbackToMock: parseBoolean(env.AGENT_PROVIDER_FALLBACK_TO_MOCK, false)
    },
    slackWebhookUrl: optionalString(env.SLACK_WEBHOOK_URL),
    slackNotificationPolicy: {
      routinePreview: parseBoolean(env.SLACK_NOTIFY_ROUTINE_PREVIEW, false),
      routineDryRun: parseBoolean(env.SLACK_NOTIFY_ROUTINE_DRY_RUN, false),
      approvalNeeded: parseBoolean(env.SLACK_NOTIFY_APPROVAL_NEEDED, true),
      actionNeeded: parseBoolean(env.SLACK_NOTIFY_ACTION_NEEDED, true),
      dailyReport: parseBoolean(env.SLACK_NOTIFY_DAILY_REPORT, true),
      monthlyReport: parseBoolean(env.SLACK_NOTIFY_MONTHLY_REPORT, true),
      liveSubmit: parseBoolean(env.SLACK_NOTIFY_LIVE_SUBMIT, true)
    },
    githubToken: optionalString(env.GITHUB_TOKEN),
    githubRepository: parseGitHubRepository(env.GITHUB_REPOSITORY),
    githubApiBaseUrl: optionalString(env.GITHUB_API_BASE_URL) ?? "https://api.github.com",
    githubCreateIssues: parseBoolean(env.GITHUB_CREATE_ISSUES, false),
    reportOutputDir: optionalString(env.REPORT_OUTPUT_DIR) ?? "reports/generated"
  };
}

function parseRiskProfile(value: string | undefined): RiskProfileName {
  const normalized = (value ?? "balanced").trim().toLowerCase();

  if (normalized === "conservative" || normalized === "balanced" || normalized === "aggressive") {
    return normalized;
  }

  throw new Error(`RISK_PROFILE must be one of "conservative", "balanced", or "aggressive". Received: ${value ?? ""}`);
}

function parseStrategyProfile(
  value: string | undefined,
  key: string,
  defaultValue: StrategyProfileName = "default"
): StrategyProfileName {
  const normalized = (value ?? defaultValue).trim().toLowerCase();

  if (normalized === "default" || normalized === "stablecoin") {
    return normalized;
  }

  throw new Error(`${key} must be either "default" or "stablecoin". Received: ${value ?? ""}`);
}

function parseStrategyProfileOverrides(value: string | undefined): Record<string, StrategyProfileName> {
  const normalized = optionalString(value);

  if (!normalized) {
    return {};
  }

  return normalized.split(",").reduce<Record<string, StrategyProfileName>>((accumulator, entry) => {
    const [rawTarget, rawProfile] = entry.split(":");

    if (!rawTarget || !rawProfile) {
      throw new Error(`STRATEGY_PROFILE_OVERRIDES entries must use TARGET:PROFILE format. Received: ${entry}`);
    }

    const target = parseAssetSymbol(rawTarget, "STRATEGY_PROFILE_OVERRIDES");
    accumulator[target] = parseStrategyProfile(rawProfile, `STRATEGY_PROFILE_OVERRIDES for ${target}`);
    return accumulator;
  }, {});
}

function parseGitHubRepository(value: string | undefined): GitHubRepository | undefined {
  const normalized = optionalString(value);

  if (!normalized) {
    return undefined;
  }

  const match = /^(?<owner>[A-Za-z0-9_.-]+)\/(?<name>[A-Za-z0-9_.-]+)$/.exec(normalized);

  if (!match?.groups) {
    throw new Error(`GITHUB_REPOSITORY must use the owner/repo format. Received: ${normalized}`);
  }

  const { owner, name } = match.groups;
  return {
    owner,
    name,
    fullName: `${owner}/${name}`
  };
}

function parseAgentDecisionProvider(value: string | undefined): AgentDecisionProviderName {
  const normalized = (value ?? "mock").trim().toLowerCase();

  if (normalized === "mock" || normalized === "openai-compatible") {
    return normalized;
  }

  throw new Error(`AGENT_DECISION_PROVIDER must be either "mock" or "openai-compatible". Received: ${value ?? ""}`);
}

function parseOptionalTemperature(value: string | undefined, key: string): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new Error(`${key} must be between 0 and 2. Received: ${value}`);
  }

  return parsed;
}

function parseOptionalUrl(value: string | undefined, key: string): string | undefined {
  const normalized = optionalString(value);

  if (!normalized) {
    return undefined;
  }

  try {
    return new URL(normalized).toString();
  } catch {
    throw new Error(`${key} must be a valid absolute URL. Received: ${normalized}`);
  }
}

function parseMarketDataMode(value: string | undefined): MarketDataMode {
  const normalized = (value ?? "auto").trim().toLowerCase();

  if (normalized === "auto" || normalized === "live" || normalized === "mock") {
    return normalized;
  }

  throw new Error(`MARKET_DATA_MODE must be one of \"auto\", \"live\", or \"mock\". Received: ${value ?? ""}`);
}

function parseSelectionMode(value: string | undefined): SelectionMode {
  const normalized = (value ?? "allowlist").trim().toLowerCase();

  if (normalized === "allowlist" || normalized === "auto") {
    return normalized;
  }

  throw new Error(`SELECTION_MODE must be either "allowlist" or "auto". Received: ${value ?? ""}`);
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parsePositiveInteger(value: string | undefined, defaultValue: number, key: string): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer. Received: ${value}`);
  }

  return parsed;
}

function parsePositiveNumber(value: string | undefined, defaultValue: number, key: string): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive number. Received: ${value}`);
  }

  return parsed;
}

function parseNonNegativeNumber(value: string | undefined, defaultValue: number, key: string): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number. Received: ${value}`);
  }

  return parsed;
}

function parseFraction(value: string | undefined, defaultValue: number, key: string): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error(`${key} must be greater than 0 and less than or equal to 1. Received: ${value}`);
  }

  return parsed;
}

function parseAssetList(value: string | undefined): string[] {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => parseAssetSymbol(item, "asset list"))
    )
  );
}

function parseAssetSymbol(value: string, key: string): string {
  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    throw new Error(`${key} contains an invalid symbol: ${value}`);
  }

  return normalized;
}

function optionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}
