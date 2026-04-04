import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AgentDecisionContract,
  AgentDecisionState,
  AgentDryRunExecutionRecord,
  AgentMarketDecisionSnapshot
} from "./contracts.js";
import { validateAgentDecisionState } from "./contracts.js";

export interface PersistedAgentArtifacts {
  snapshotLatestPath: string;
  snapshotDatedPath: string;
  decisionLatestPath: string;
  decisionDatedPath: string;
  executionLatestPath: string;
  executionDatedPath: string;
  stateLatestPath: string;
  stateDatedPath: string;
}

export async function readLatestAgentDecisionState(outputDir: string): Promise<AgentDecisionState | undefined> {
  const stateLatestPath = path.resolve(outputDir, "state", "latest.json");

  try {
    const raw = await readFile(stateLatestPath, "utf8");
    return validateAgentDecisionState(upgradeLegacyStateShape(JSON.parse(raw)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return undefined;
    }

    throw new Error(`Failed to read previous agent decision state: ${message}`);
  }
}

function upgradeLegacyStateShape(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }

  const state = value as Record<string, unknown>;

  if (typeof state.latestExecutionId !== "string" || state.latestExecutionId.trim() === "") {
    state.latestExecutionId = `legacy-${typeof state.latestDecisionId === "string" ? state.latestDecisionId : "decision"}`;
  }

  if (typeof state.latestExecutionPath !== "string" || state.latestExecutionPath.trim() === "") {
    state.latestExecutionPath =
      typeof state.latestDecisionPath === "string" && state.latestDecisionPath.trim() !== ""
        ? state.latestDecisionPath
        : path.resolve("artifacts/agent-decision", "executions", "legacy.json");
  }

  return state;
}

export async function persistAgentDecisionArtifacts(input: {
  outputDir: string;
  snapshot: AgentMarketDecisionSnapshot;
  decision: AgentDecisionContract;
  execution: AgentDryRunExecutionRecord;
}): Promise<{ state: AgentDecisionState; paths: PersistedAgentArtifacts }> {
  const outputDir = path.resolve(input.outputDir);
  const snapshotDir = path.join(outputDir, "snapshots");
  const decisionDir = path.join(outputDir, "decisions");
  const executionDir = path.join(outputDir, "executions");
  const stateDir = path.join(outputDir, "state");

  await Promise.all([
    mkdir(snapshotDir, { recursive: true }),
    mkdir(decisionDir, { recursive: true }),
    mkdir(executionDir, { recursive: true }),
    mkdir(stateDir, { recursive: true })
  ]);

  const fileName = `${input.snapshot.createdAt.replace(/[:.]/g, "-")}.json`;
  const snapshotLatestPath = path.join(snapshotDir, "latest.json");
  const snapshotDatedPath = path.join(snapshotDir, fileName);
  const decisionLatestPath = path.join(decisionDir, "latest.json");
  const decisionDatedPath = path.join(decisionDir, fileName);
  const executionLatestPath = path.join(executionDir, "latest.json");
  const executionDatedPath = path.join(executionDir, fileName);
  const stateLatestPath = path.join(stateDir, "latest.json");
  const stateDatedPath = path.join(stateDir, fileName);

  const state: AgentDecisionState = validateAgentDecisionState({
    schemaVersion: "1",
    updatedAt: input.decision.createdAt,
    latestSnapshotId: input.snapshot.snapshotId,
    latestDecisionId: input.decision.decisionId,
    latestExecutionId: input.execution.executionId,
    latestAction: input.decision.action,
    latestTarget: input.decision.target,
    latestSnapshotPath: snapshotDatedPath,
    latestDecisionPath: decisionDatedPath,
    latestExecutionPath: executionDatedPath,
    provider: input.decision.provider
  });

  await Promise.all([
    writeJson(snapshotLatestPath, input.snapshot),
    writeJson(snapshotDatedPath, input.snapshot),
    writeJson(decisionLatestPath, input.decision),
    writeJson(decisionDatedPath, input.decision),
    writeJson(executionLatestPath, input.execution),
    writeJson(executionDatedPath, input.execution),
    writeJson(stateLatestPath, state),
    writeJson(stateDatedPath, state)
  ]);

  return {
    state,
    paths: {
      snapshotLatestPath,
      snapshotDatedPath,
      decisionLatestPath,
      decisionDatedPath,
      executionLatestPath,
      executionDatedPath,
      stateLatestPath,
      stateDatedPath
    }
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
