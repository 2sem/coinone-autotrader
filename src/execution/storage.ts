import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  validateExecutionApprovalArtifact,
  validateExecutionPreviewArtifact,
  validateExecutionSubmitArtifact,
  type ExecutionApprovalArtifact,
  type ExecutionPreviewArtifact,
  type ExecutionSubmitArtifact
} from "./contracts.js";

export interface PersistArtifactPaths {
  latestPath: string;
  datedPath: string;
}

export async function persistExecutionArtifact(
  outputDir: string,
  kind: "previews" | "approvals" | "submits",
  createdAt: string,
  artifact: unknown
): Promise<PersistArtifactPaths> {
  const dir = path.resolve(outputDir, kind);
  await mkdir(dir, { recursive: true });

  const fileName = `${createdAt.replace(/[:.]/g, "-")}.json`;
  const latestPath = path.join(dir, "latest.json");
  const datedPath = path.join(dir, fileName);

  await Promise.all([writeJson(latestPath, artifact), writeJson(datedPath, artifact)]);

  return {
    latestPath,
    datedPath
  };
}

export async function readExecutionPreviewArtifact(outputDir: string, previewId?: string): Promise<ExecutionPreviewArtifact> {
  const parsed = previewId
    ? validateExecutionPreviewArtifact(await readArtifactById(outputDir, "previews", "previewId", previewId))
    : validateExecutionPreviewArtifact(await readLatestArtifact(outputDir, "previews"));

  if (previewId && parsed.previewId !== previewId) {
    throw new Error(`Preview lookup mismatch. Expected ${previewId}, received ${parsed.previewId}.`);
  }

  return parsed;
}

export async function readExecutionApprovalArtifact(
  outputDir: string,
  approvalId?: string
): Promise<ExecutionApprovalArtifact | undefined> {
  try {
    const parsed = approvalId
      ? validateExecutionApprovalArtifact(await readArtifactById(outputDir, "approvals", "approvalId", approvalId))
      : validateExecutionApprovalArtifact(await readLatestArtifact(outputDir, "approvals"));

    if (approvalId && parsed.approvalId !== approvalId) {
      throw new Error(`Approval lookup mismatch. Expected ${approvalId}, received ${parsed.approvalId}.`);
    }

    return parsed;
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function readExecutionSubmitArtifact(outputDir: string): Promise<ExecutionSubmitArtifact | undefined> {
  try {
    return validateExecutionSubmitArtifact(await readLatestArtifact(outputDir, "submits"));
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}

export function buildExecutionRunId(prefix: string, timestamp: string): string {
  return `${prefix}-${timestamp.replace(/[:.]/g, "-")}`;
}

async function readLatestArtifact(outputDir: string, kind: "previews" | "approvals" | "submits"): Promise<unknown> {
  const filePath = path.resolve(outputDir, kind, "latest.json");
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function readArtifactById(
  outputDir: string,
  kind: "previews" | "approvals" | "submits",
  idKey: "previewId" | "approvalId",
  expectedId: string
): Promise<unknown> {
  const dir = path.resolve(outputDir, kind);
  const fileNames = (await readdir(dir)).filter((fileName) => fileName.endsWith(".json") && fileName !== "latest.json");

  for (const fileName of fileNames.sort().reverse()) {
    const filePath = path.join(dir, fileName);
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;

    if (parsed[idKey] === expectedId) {
      return parsed;
    }
  }

  throw new Error(`${kind.slice(0, -1)} artifact not found for ${expectedId}.`);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isMissingFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("ENOENT") || message.includes("not found");
}
