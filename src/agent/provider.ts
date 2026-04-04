import type { AppConfig } from "../config/env.js";
import {
  type AgentDecisionContract,
  type AgentDecisionState,
  type AgentMarketDecisionSnapshot,
  type DecisionAction,
  type DecisionProviderKind,
  validateAgentDecisionContract
} from "./contracts.js";
import { buildRunId } from "./snapshot.js";
import { buildKoreanDecisionSummary } from "./user-facing.js";

export interface AgentDecisionContext {
  previousState?: AgentDecisionState;
  config: AppConfig;
}

export interface AgentProviderRequest {
  requestId: string;
  createdAt: string;
  snapshot: AgentMarketDecisionSnapshot;
  previousState?: AgentDecisionState;
  instructions: {
    system: string;
    user: string;
    responseFormat: "json";
  };
  runtime: {
    provider: AppConfig["agentDecisionProvider"];
    providerKind: DecisionProviderKind;
    model?: string;
    promptVersion: string;
    temperature?: number;
  };
}

export interface AgentProviderResponse {
  decision: AgentDecisionContract;
  rawResponse?: string;
}

export interface AgentDecisionProvider {
  readonly name: AppConfig["agentDecisionProvider"];
  readonly kind: DecisionProviderKind;
  buildRequest(snapshot: AgentMarketDecisionSnapshot, context: AgentDecisionContext): AgentProviderRequest;
  decide(request: AgentProviderRequest): Promise<AgentProviderResponse>;
}

export function createAgentDecisionProvider(config: AppConfig): AgentDecisionProvider {
  if (config.agentDecisionProvider === "mock") {
    return new MockAgentDecisionProvider(config);
  }

  if (config.agentDecisionProvider === "openai-compatible") {
    return new OpenAICompatibleAgentDecisionProvider(config);
  }

  throw new Error(`Unsupported agent decision provider: ${config.agentDecisionProvider}`);
}

class MockAgentDecisionProvider implements AgentDecisionProvider {
  readonly name = "mock" as const;
  readonly kind = "deterministic" as const;

  constructor(private readonly config: AppConfig) {}

  buildRequest(snapshot: AgentMarketDecisionSnapshot, context: AgentDecisionContext): AgentProviderRequest {
    return buildProviderRequest(snapshot, context, this.name, this.kind);
  }

  async decide(request: AgentProviderRequest): Promise<AgentProviderResponse> {
    const decision = buildMockDecision(request, this.name, this.kind);

    return {
      decision,
      rawResponse: JSON.stringify({
        action: decision.action,
        confidence: decision.confidence,
        target: decision.target,
        reason: decision.reason
      })
    };
  }
}

class OpenAICompatibleAgentDecisionProvider implements AgentDecisionProvider {
  readonly name = "openai-compatible" as const;
  readonly kind = "model-backed" as const;

  constructor(private readonly config: AppConfig) {}

  buildRequest(snapshot: AgentMarketDecisionSnapshot, context: AgentDecisionContext): AgentProviderRequest {
    return buildProviderRequest(snapshot, context, this.name, this.kind);
  }

  async decide(request: AgentProviderRequest): Promise<AgentProviderResponse> {
    const runtime = this.config.agentProviderRuntime;
    const missingConfig = [
      !runtime.endpoint ? "AGENT_PROVIDER_ENDPOINT" : undefined,
      !runtime.apiKey ? "AGENT_PROVIDER_API_KEY" : undefined,
      !runtime.model ? "AGENT_PROVIDER_MODEL" : undefined
    ].filter((value): value is string => Boolean(value));

    if (missingConfig.length > 0) {
      throw new Error(
        `OpenAI-compatible provider requires ${missingConfig.join(", ")} when AGENT_DECISION_PROVIDER=openai-compatible.`
      );
    }

    const endpoint = runtime.endpoint;
    const apiKey = runtime.apiKey;
    const model = runtime.model;

    if (!endpoint || !apiKey || !model) {
      throw new Error("OpenAI-compatible provider configuration disappeared after validation.");
    }

    const body = {
      model,
      messages: [
        { role: "system", content: request.instructions.system },
        { role: "user", content: request.instructions.user }
      ],
      response_format: { type: "json_object" },
      ...(runtime.temperature === undefined ? {} : { temperature: runtime.temperature })
    };

    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(runtime.timeoutMs)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI-compatible provider request failed: ${message}`);
    }

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible provider returned HTTP ${response.status} ${response.statusText}: ${truncate(responseText, 400)}`
      );
    }

    let envelope: unknown;

    try {
      envelope = JSON.parse(responseText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI-compatible provider returned a non-JSON envelope: ${message}`);
    }

    const rawResponse = extractOpenAICompatibleContent(envelope);
    let parsedDecision: unknown;

    try {
      parsedDecision = JSON.parse(rawResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI-compatible provider did not return valid JSON decision content: ${message}`);
    }

    return {
      decision: normalizeModelDecision(parsedDecision, request, this.name, this.kind),
      rawResponse
    };
  }
}

function buildProviderRequest(
  snapshot: AgentMarketDecisionSnapshot,
  context: AgentDecisionContext,
  provider: AppConfig["agentDecisionProvider"],
  providerKind: DecisionProviderKind
): AgentProviderRequest {
  const createdAt = new Date().toISOString();

  return {
    requestId: buildRunId("provider-request", createdAt),
    createdAt,
    snapshot,
    previousState: context.previousState,
    instructions: {
      system: buildSystemInstruction(provider, providerKind),
      user: buildUserInstruction(snapshot, context.previousState),
      responseFormat: "json"
    },
    runtime: {
      provider,
      providerKind,
      model: context.config.agentProviderRuntime.model,
      promptVersion: context.config.agentProviderRuntime.promptVersion,
      temperature: context.config.agentProviderRuntime.temperature
    }
  };
}

function buildMockDecision(
  request: AgentProviderRequest,
  provider: AgentDecisionContract["provider"],
  providerKind: AgentDecisionContract["providerKind"]
): AgentDecisionContract {
  const { snapshot, previousState } = request;
  const primaryTicker = snapshot.tickers[0];
  const primaryPosition = snapshot.portfolio.positions.find((position) => position.target === primaryTicker?.target);
  const accountReady = snapshot.account.configured;
  const previousAction = previousState?.latestAction;
  const createdAt = new Date().toISOString();
  const hasExistingPosition = Boolean(primaryPosition && Number(primaryPosition.heldQuantity) > 0);

  return validateAgentDecisionContract({
    schemaVersion: "1",
    decisionId: buildRunId("decision", createdAt),
    snapshotId: snapshot.snapshotId,
    createdAt,
    provider,
    providerKind,
    action: "hold",
    target: primaryTicker?.target,
    pair: primaryTicker?.pair,
    quoteCurrency: snapshot.quoteCurrency,
    confidence: "medium",
    confidenceScore: 0.58,
    reason: buildHoldReason(snapshot, previousAction),
    riskNotes: [
      "Dry-run mode remains mandatory; any execution record is informational only.",
      accountReady
        ? "Account data is available for read-only context, but the placeholder provider still avoids order requests."
        : "Account data is unavailable, so the provider intentionally avoids proposing executable orders."
    ],
    stateUpdates: [
      {
        key: "lastEvaluationTarget",
        value: primaryTicker?.target ?? "none",
        reason: "Records which selected target the placeholder provider examined first."
      },
      {
        key: "decisionMode",
        value: "dry-run-placeholder",
        reason: "Marks the current provider path as a deterministic stand-in for a future model-backed provider."
      }
    ],
    order: {},
    providerContext: {
      requestId: request.requestId,
      promptVersion: request.runtime.promptVersion,
      model: request.runtime.model,
      temperature: request.runtime.temperature,
      rawResponseFormat: "json"
    },
    safeguards: buildSafeguards(snapshot),
    evidence: {
      selectedTargets: snapshot.selectedTargets,
      notes: [
        `Selected target count: ${snapshot.selectedTargets.length}.`,
        `Account configured: ${accountReady}.`,
        `Previous action: ${previousAction ?? "none"}.`,
        hasExistingPosition
          ? `Existing position detected for ${primaryPosition?.target ?? primaryTicker?.target ?? "unknown"}; placeholder provider stays conservative.`
          : "Placeholder provider does not yet request an order and returns a safe hold contract."
      ]
    },
    userFacing: buildKoreanDecisionSummary({
      snapshot,
      action: "hold",
      target: primaryTicker?.target,
      previousAction,
      accountReady,
      hasExistingPosition
    })
  });
}

function normalizeModelDecision(
  value: unknown,
  request: AgentProviderRequest,
  provider: AgentDecisionContract["provider"],
  providerKind: AgentDecisionContract["providerKind"]
): AgentDecisionContract {
  const decision = expectRecord(value, "decision");
  const action = expectDecisionAction(decision.action, "decision.action");
  const target = optionalString(decision.target, "decision.target");
  const snapshotTarget = target ?? request.snapshot.tickers[0]?.target;
  const previousAction = request.previousState?.latestAction;
  const position = request.snapshot.portfolio.positions.find((entry) => entry.target === snapshotTarget);
  const hasExistingPosition = Boolean(position && Number(position.heldQuantity) > 0);
  const accountReady = request.snapshot.account.configured;
  const createdAt = optionalString(decision.createdAt, "decision.createdAt") ?? new Date().toISOString();
  const evidence = expectRecord(decision.evidence, "decision.evidence");
  const order = expectRecord(decision.order, "decision.order");

  return validateAgentDecisionContract({
    schemaVersion: "1",
    decisionId: optionalString(decision.decisionId, "decision.decisionId") ?? buildRunId("decision", createdAt),
    snapshotId: request.snapshot.snapshotId,
    createdAt,
    provider,
    providerKind,
    action,
    target,
    pair: optionalString(decision.pair, "decision.pair") ?? resolvePair(request.snapshot, snapshotTarget),
    quoteCurrency: request.snapshot.quoteCurrency,
    confidence: expectConfidence(decision.confidence, "decision.confidence"),
    confidenceScore: optionalNumber(decision.confidenceScore, "decision.confidenceScore", 0, 1),
    reason: expectString(decision.reason, "decision.reason"),
    riskNotes: expectStringArray(decision.riskNotes, "decision.riskNotes"),
    stateUpdates: expectStateUpdates(decision.stateUpdates, "decision.stateUpdates"),
    order: {
      orderValue: optionalString(order.orderValue, "decision.order.orderValue"),
      quantity: optionalString(order.quantity, "decision.order.quantity")
    },
    providerContext: {
      requestId: request.requestId,
      promptVersion: request.runtime.promptVersion,
      model: request.runtime.model,
      temperature: request.runtime.temperature,
      rawResponseFormat: "json"
    },
    safeguards: buildSafeguards(request.snapshot),
    evidence: {
      selectedTargets: expectStringArray(evidence.selectedTargets, "decision.evidence.selectedTargets"),
      notes: expectStringArray(evidence.notes, "decision.evidence.notes")
    },
    userFacing: buildKoreanDecisionSummary({
      snapshot: request.snapshot,
      action,
      target: snapshotTarget,
      previousAction,
      accountReady,
      hasExistingPosition
    })
  });
}

function buildSystemInstruction(
  provider: AgentProviderRequest["runtime"]["provider"],
  providerKind: AgentProviderRequest["runtime"]["providerKind"]
): string {
  return [
    "You are the decision engine for the Coinone agent dry-run workflow.",
    "Think in English and return exactly one JSON object with no markdown, code fences, or extra narration.",
    "The JSON must satisfy the version-1 decision contract used by this app.",
    'Required top-level fields: schemaVersion, decisionId, snapshotId, createdAt, provider, providerKind, action, quoteCurrency, confidence, reason, riskNotes, stateUpdates, order, providerContext, safeguards, evidence, userFacing.',
    'Valid actions: "buy", "sell", "hold". Valid confidence: "low", "medium", "high".',
    'riskNotes and evidence.notes must be arrays of English strings. stateUpdates must be an array of { key, value, reason } objects.',
    "Use dry-run safety first. If data is incomplete, confidence is low, or safeguards block confident sizing, return hold.",
    "Never assume live execution is allowed. Any buy or sell output is still a dry-run recommendation only.",
    'For hold, return an empty order object: {}. For buy or sell, keep order.orderValue and order.quantity as strings when known.',
    `Set provider to "${provider}", providerKind to "${providerKind}", providerContext.rawResponseFormat to "json", and userFacing.locale to "ko-KR".`
  ].join(" ");
}

function buildUserInstruction(snapshot: AgentMarketDecisionSnapshot, previousState?: AgentDecisionState): string {
  return JSON.stringify(
    {
      task: "Produce the next Coinone dry-run decision.",
      requirements: [
        "Reason internally in English.",
        "Return strict JSON only.",
        "Prefer hold whenever safety or data quality is uncertain.",
        "Respect the snapshot safeguards and dry-run-only environment.",
        "Do not invent balances, prices, order sizes, or completed orders."
      ],
      snapshot,
      previousState: previousState ?? null
    },
    null,
    2
  );
}

function buildHoldReason(snapshot: AgentMarketDecisionSnapshot, previousAction: string | undefined): string {
  if (snapshot.selectedTargets.length === 0) {
    return "Hold: no targets were selected, so the placeholder agent has nothing to evaluate.";
  }

  if (!snapshot.account.configured) {
    return "Hold: read-only account state is unavailable, so the placeholder agent keeps the run fully conservative.";
  }

  if (previousAction) {
    return `Hold: previous state recorded ${previousAction}, and the placeholder agent avoids oscillating actions.`;
  }

  return "Hold: the deterministic mock provider remains conservative and does not request executable orders.";
}

function buildSafeguards(snapshot: AgentMarketDecisionSnapshot): AgentDecisionContract["safeguards"] {
  return {
    dryRun: snapshot.dryRun,
    liveTradingEnabled: snapshot.liveTradingEnabled,
    liveTradingBlocked: snapshot.liveTradingBlocked,
    readOnlyData: !snapshot.account.configured || snapshot.account.source === "live-cli"
  };
}

function resolvePair(snapshot: AgentMarketDecisionSnapshot, target?: string): string | undefined {
  if (!target) {
    return undefined;
  }

  return snapshot.tickers.find((ticker) => ticker.target === target)?.pair ?? `${target}/${snapshot.quoteCurrency}`;
}

function extractOpenAICompatibleContent(value: unknown): string {
  const envelope = expectRecord(value, "provider response");
  const choices = expectArray(envelope.choices, "provider response.choices");
  const firstChoice = expectRecord(choices[0], "provider response.choices[0]");

  if (typeof firstChoice.text === "string" && firstChoice.text.trim() !== "") {
    return firstChoice.text;
  }

  const message = expectRecord(firstChoice.message, "provider response.choices[0].message");
  const content = message.content;

  if (typeof content === "string" && content.trim() !== "") {
    return content;
  }

  if (Array.isArray(content)) {
    const combined = content
      .map((entry, index) => {
        const chunk = expectRecord(entry, `provider response.choices[0].message.content[${index}]`);
        return optionalString(chunk.text, `provider response.choices[0].message.content[${index}].text`) ?? "";
      })
      .join("")
      .trim();

    if (combined !== "") {
      return combined;
    }
  }

  throw new Error("OpenAI-compatible provider response did not include a usable message content payload.");
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return expectString(value, label);
}

function optionalNumber(value: unknown, label: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a finite number between ${min} and ${max}.`);
  }

  return value;
}

function expectStringArray(value: unknown, label: string): string[] {
  return expectArray(value, label).map((entry, index) => expectString(entry, `${label}[${index}]`));
}

function expectDecisionAction(value: unknown, label: string): DecisionAction {
  if (value === "buy" || value === "sell" || value === "hold") {
    return value;
  }

  throw new Error(`${label} must be one of: buy, sell, hold.`);
}

function expectConfidence(value: unknown, label: string): AgentDecisionContract["confidence"] {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new Error(`${label} must be one of: low, medium, high.`);
}

function expectStateUpdates(value: unknown, label: string): AgentDecisionContract["stateUpdates"] {
  return expectArray(value, label).map((entry, index) => {
    const update = expectRecord(entry, `${label}[${index}]`);

    return {
      key: expectString(update.key, `${label}[${index}].key`),
      value: expectString(update.value, `${label}[${index}].value`),
      reason: expectString(update.reason, `${label}[${index}].reason`)
    };
  });
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}
