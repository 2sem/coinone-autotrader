import type { AppConfig } from "../config/env.js";
import type {
  AgentDecisionContract,
  AgentDecisionState,
  AgentDryRunExecutionRecord,
  AgentMarketDecisionSnapshot
} from "./contracts.js";
import { validateAgentDecisionContract } from "./contracts.js";
import { buildDryRunExecutionRecord } from "./execution.js";
import { buildAgentMarketDecisionSnapshot } from "./snapshot.js";
import { createAgentDecisionProvider } from "./provider.js";
import { persistAgentDecisionArtifacts, readLatestAgentDecisionState } from "./state-store.js";

export interface AgentDecisionRunResult {
  workflow: "agent-decision-dry-run";
  provider: AppConfig["agentDecisionProvider"];
  dryRun: boolean;
  liveTradingEnabled: boolean;
  liveTradingBlocked: boolean;
  snapshot: AgentMarketDecisionSnapshot;
  previousState?: AgentDecisionState;
  decision: AgentDecisionContract;
  execution: AgentDryRunExecutionRecord;
  persistedState: AgentDecisionState;
  output: {
    baseDir: string;
    snapshotLatestPath: string;
    snapshotDatedPath: string;
    decisionLatestPath: string;
    decisionDatedPath: string;
    executionLatestPath: string;
    executionDatedPath: string;
    stateLatestPath: string;
    stateDatedPath: string;
  };
  notes: string[];
}

export async function runAgentDecisionDryRun(config: AppConfig): Promise<AgentDecisionRunResult> {
  const previousState = await readLatestAgentDecisionState(config.agentDecisionOutputDir);
  const snapshot = await buildAgentMarketDecisionSnapshot(config);
  let provider = createAgentDecisionProvider(config);
  let providerRequest = provider.buildRequest(snapshot, { previousState, config });
  let providerResponse;
  const providerNotes: string[] = [];

  try {
    providerResponse = await provider.decide(providerRequest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (config.agentDecisionProvider === "openai-compatible" && config.agentProviderRuntime.fallbackToMock) {
      const fallbackConfig: AppConfig = {
        ...config,
        agentDecisionProvider: "mock"
      };

      provider = createAgentDecisionProvider(fallbackConfig);
      providerRequest = provider.buildRequest(snapshot, { previousState, config: fallbackConfig });
      providerResponse = await provider.decide(providerRequest);
      providerNotes.push(`OpenAI-compatible provider failed and the run fell back to mock: ${message}`);
    } else {
      throw new Error(`Agent decision provider failed safely before execution artifacts were written: ${message}`);
    }
  }

  const decision = validateAgentDecisionContract(providerResponse.decision);
  const execution = buildDryRunExecutionRecord(decision);
  const persisted = await persistAgentDecisionArtifacts({
    outputDir: config.agentDecisionOutputDir,
    snapshot,
    decision,
    execution
  });

  return {
    workflow: "agent-decision-dry-run",
    provider: provider.name,
    dryRun: config.dryRun,
    liveTradingEnabled: config.enableLiveTrading,
    liveTradingBlocked: !config.enableLiveTrading || config.tradingKillSwitch,
    snapshot,
    previousState,
    decision,
    execution,
    persistedState: persisted.state,
    output: {
      baseDir: config.agentDecisionOutputDir,
      ...persisted.paths
    },
    notes: [
      `Provider contract prepared ${provider.kind} execution with request metadata and strict JSON response expectations.`,
      "Snapshot, decision, execution record, and latest state are persisted to disk for later inspection and replacement with a real LLM provider.",
      "Decision validation completes before the dry-run execution record is generated or written.",
      "Live order placement remains disabled.",
      ...providerNotes
    ]
  };
}
