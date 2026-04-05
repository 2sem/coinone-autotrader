export type RuntimeStepName =
  | "collect:snapshot"
  | "analyze:market"
  | "decision:run"
  | "rule:validate"
  | "decision:review"
  | "log:trade-comment";

export type RuntimeStepStatus = "pending" | "completed" | "failed" | "skipped";
export type RuntimeRunStatus = "running" | "completed" | "failed";

export interface RuntimeStepRecord {
  name: RuntimeStepName;
  status: RuntimeStepStatus;
  message?: string;
  artifactPath?: string;
  completedAt?: string;
}

export interface RuntimeStatusArtifact {
  schemaVersion: "1";
  runId: string;
  createdAt: string;
  updatedAt: string;
  status: RuntimeRunStatus;
  currentStep: RuntimeStepName | "done";
  failureStep?: RuntimeStepName;
  failureMessage?: string;
  steps: RuntimeStepRecord[];
}

export function validateRuntimeStatusArtifact(value: unknown): RuntimeStatusArtifact {
  const artifact = expectRecord(value, "status");
  expectLiteral(artifact.schemaVersion, "1", "status.schemaVersion");
  expectString(artifact.runId, "status.runId");
  expectString(artifact.createdAt, "status.createdAt");
  expectString(artifact.updatedAt, "status.updatedAt");
  expectEnum(artifact.status, ["running", "completed", "failed"], "status.status");
  expectEnum(
    artifact.currentStep,
    ["collect:snapshot", "analyze:market", "decision:run", "rule:validate", "decision:review", "log:trade-comment", "done"],
    "status.currentStep"
  );

  if (artifact.failureStep !== undefined) {
    expectEnum(
      artifact.failureStep,
      ["collect:snapshot", "analyze:market", "decision:run", "rule:validate", "decision:review", "log:trade-comment"],
      "status.failureStep"
    );
  }

  if (artifact.failureMessage !== undefined) {
    expectString(artifact.failureMessage, "status.failureMessage");
  }

  if (!Array.isArray(artifact.steps)) {
    throw new Error("status.steps must be an array.");
  }

  artifact.steps.forEach((step, index) => {
    const record = expectRecord(step, `status.steps[${index}]`);
    expectEnum(
      record.name,
      ["collect:snapshot", "analyze:market", "decision:run", "rule:validate", "decision:review", "log:trade-comment"],
      `status.steps[${index}].name`
    );
    expectEnum(record.status, ["pending", "completed", "failed", "skipped"], `status.steps[${index}].status`);
    if (record.message !== undefined) expectString(record.message, `status.steps[${index}].message`);
    if (record.artifactPath !== undefined) expectString(record.artifactPath, `status.steps[${index}].artifactPath`);
    if (record.completedAt !== undefined) expectString(record.completedAt, `status.steps[${index}].completedAt`);
  });

  return artifact as unknown as RuntimeStatusArtifact;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function expectLiteral<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must be ${expected}.`);
  return expected;
}

function expectEnum<T extends string>(value: unknown, expected: T[], label: string): T {
  if (typeof value !== "string" || !expected.includes(value as T)) throw new Error(`${label} must be one of ${expected.join(", ")}.`);
  return value as T;
}
