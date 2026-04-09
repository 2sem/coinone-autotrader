import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildRunId } from "../agent/snapshot.js";
import type { RuntimeStatusArtifact, RuntimeStepName, RuntimeStepRecord } from "./contracts/index.js";
import { validateRuntimeStatusArtifact } from "./contracts/index.js";

const DEFAULT_OUTPUT_DIR = "artifacts/runtime";
const STEP_ORDER: RuntimeStepName[] = [
  "collect:snapshot",
  "analyze:market",
  "decision:run",
  "rule:validate",
  "decision:review",
  "log:trade-comment"
];

export function createRuntimeStatusArtifact(createdAt = new Date().toISOString()): RuntimeStatusArtifact {
  return validateRuntimeStatusArtifact({
    schemaVersion: "1",
    runId: buildRunId("runtime-run", createdAt),
    createdAt,
    updatedAt: createdAt,
    status: "running",
    result: "pending",
    pendingReason: "none",
    currentStep: STEP_ORDER[0],
    steps: STEP_ORDER.map<RuntimeStepRecord>((name) => ({ name, status: "pending" }))
  });
}

export function markRuntimeStepCompleted(
  artifact: RuntimeStatusArtifact,
  step: RuntimeStepName,
  message?: string,
  artifactPath?: string,
  completedAt = new Date().toISOString()
): RuntimeStatusArtifact {
  return updateArtifact(artifact, (draft) => {
    const record = draft.steps.find((entry) => entry.name === step);
    if (record) {
      record.status = "completed";
      record.message = message;
      record.artifactPath = artifactPath;
      record.completedAt = completedAt;
    }

    draft.currentStep = nextPendingStep(draft.steps) ?? "done";
    draft.updatedAt = completedAt;
    if (draft.currentStep === "done") {
      draft.status = "completed";
    }
  });
}

export function finalizeRuntimeResult(
  artifact: RuntimeStatusArtifact,
  input: { result: RuntimeStatusArtifact["result"]; pendingReason: RuntimeStatusArtifact["pendingReason"] }
): RuntimeStatusArtifact {
  return updateArtifact(artifact, (draft) => {
    draft.result = input.result;
    draft.pendingReason = input.pendingReason;
  });
}

export function markRuntimeStepFailed(
  artifact: RuntimeStatusArtifact,
  step: RuntimeStepName,
  errorMessage: string,
  failedAt = new Date().toISOString()
): RuntimeStatusArtifact {
  return updateArtifact(artifact, (draft) => {
    const record = draft.steps.find((entry) => entry.name === step);
    if (record) {
      record.status = "failed";
      record.message = errorMessage;
      record.completedAt = failedAt;
    }

    for (const entry of draft.steps) {
      if (entry.name !== step && entry.status === "pending") {
        entry.status = "skipped";
      }
    }

    draft.status = "failed";
    draft.result = "failed";
    draft.pendingReason = "none";
    draft.currentStep = step;
    draft.failureStep = step;
    draft.failureMessage = errorMessage;
    draft.updatedAt = failedAt;
  });
}

export async function writeRuntimeStatusArtifact(
  artifact: RuntimeStatusArtifact,
  outputDir = DEFAULT_OUTPUT_DIR
): Promise<{ latestPath: string; datedPath: string }> {
  const statusDir = path.resolve(outputDir, "status");
  await mkdir(statusDir, { recursive: true });

  const fileName = `${artifact.createdAt.replace(/[:.]/g, "-")}.json`;
  const latestPath = path.join(statusDir, "latest.json");
  const datedPath = path.join(statusDir, fileName);

  await Promise.all([writeJson(latestPath, artifact), writeJson(datedPath, artifact)]);
  return { latestPath, datedPath };
}

function nextPendingStep(steps: RuntimeStepRecord[]): RuntimeStepName | undefined {
  return steps.find((step) => step.status === "pending")?.name;
}

function updateArtifact(artifact: RuntimeStatusArtifact, mutate: (draft: RuntimeStatusArtifact) => void): RuntimeStatusArtifact {
  const draft: RuntimeStatusArtifact = JSON.parse(JSON.stringify(artifact));
  mutate(draft);
  return validateRuntimeStatusArtifact(draft);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
