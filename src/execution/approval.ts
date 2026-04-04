import type { AppConfig } from "../config/env.js";
import { validateExecutionApprovalArtifact, type ExecutionApprovalArtifact, type ExecutionPreviewArtifact } from "./contracts.js";
import { buildExecutionRunId, persistExecutionArtifact, readExecutionPreviewArtifact } from "./storage.js";

export interface ExecutionApprovalRunOptions {
  previewId?: string;
}

export interface ExecutionApprovalRunResult {
  workflow: "execution-approve";
  preview: ExecutionPreviewArtifact;
  approval: ExecutionApprovalArtifact;
  output: {
    latestPath: string;
    datedPath: string;
  };
}

export async function runExecutionApproval(
  config: AppConfig,
  options: ExecutionApprovalRunOptions = {}
): Promise<ExecutionApprovalRunResult> {
  const preview = await readExecutionPreviewArtifact(config.executionPreviewOutputDir, options.previewId);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(createdAt) + config.executionApprovalWindowSeconds * 1000).toISOString();
  const approval = validateExecutionApprovalArtifact({
    schemaVersion: "1",
    approvalId: buildExecutionRunId("execution-approval", createdAt),
    previewId: preview.previewId,
    previewCreatedAt: preview.createdAt,
    createdAt,
    expiresAt,
    status: "approved",
    workflow: "execution-approve",
    approvalWindowSeconds: config.executionApprovalWindowSeconds,
    summary: {
      locale: "ko-KR",
      headline: "실행 승인 기록",
      summary: `${preview.previewId} 미리보기에 대한 수동 승인을 기록했습니다. 승인 유효 시간은 ${config.executionApprovalWindowSeconds}초입니다.`
    },
    notes: [
      "Approval is explicitly bound to a single previewId.",
      "execution:submit must reject missing, expired, or mismatched approvals.",
      "Approval persists as an artifact only and does not send any order."
    ]
  });
  const output = await persistExecutionArtifact(config.executionPreviewOutputDir, "approvals", approval.createdAt, approval);

  return {
    workflow: "execution-approve",
    preview,
    approval,
    output
  };
}
