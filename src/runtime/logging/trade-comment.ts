import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "../../config/env.js";
import { buildRunId } from "../../agent/snapshot.js";
import { resolveGitHubRepository } from "../../reporting/github-repository.js";
import type { RuntimeAnalysis, RuntimeDecision, RuntimeReview, RuntimeSnapshot, RuntimeTradeComment } from "../contracts/index.js";
import { validateRuntimeTradeComment } from "../contracts/index.js";
import { ensureDailyIssue, type RuntimeDailyIssueRef } from "./daily-issue.js";

const DEFAULT_OUTPUT_DIR = "artifacts/runtime";

export function buildTradeComment(input: {
  snapshot: RuntimeSnapshot;
  analysis: RuntimeAnalysis;
  decision: RuntimeDecision;
  review: RuntimeReview;
  issue: RuntimeDailyIssueRef;
  now?: Date;
}): RuntimeTradeComment {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const bodyMarkdown = [
    `### ${formatKstTimestamp(now)}`,
    `- 코인: ${input.decision.target ?? "없음"}`,
    `- 판단: ${localizeAction(input.decision.action)}`,
    `- 이유: ${input.decision.userSummaryKo}`,
    `- 검토 결과: ${input.review.approved ? "승인" : "보류"}`,
    `- 실행 상태: 아직 주문하지 않음`,
    `- 다음 메모: ${summarizeExecutionPlan(input.decision)}`
  ].join("\n");

  return validateRuntimeTradeComment({
    schemaVersion: "1",
    commentId: buildRunId("runtime-comment", createdAt),
    createdAt,
    snapshotId: input.snapshot.snapshotId,
    analysisId: input.analysis.analysisId,
    decisionId: input.decision.decisionId,
    reviewId: input.review.reviewId,
    issueNumber: input.issue.issueNumber,
    issueUrl: input.issue.issueUrl,
    bodyMarkdown,
    userSummaryKo: input.decision.userSummaryKo
  });
}

export async function appendTradeComment(config: AppConfig, comment: RuntimeTradeComment): Promise<void> {
  const repository = await resolveGitHubRepository(config.githubRepository);

  // gh CLI path only
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  await execFileAsync(
      "gh",
      [
        "api",
        `repos/${repository.owner}/${repository.name}/issues/${comment.issueNumber}/comments`,
        "--method",
        "POST",
      "-f",
      `body=${comment.bodyMarkdown}`
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 4 * 1024 * 1024
    }
  );
}

export async function writeTradeCommentArtifact(comment: RuntimeTradeComment, outputDir = DEFAULT_OUTPUT_DIR): Promise<{ latestPath: string; datedPath: string }> {
  const commentDir = path.resolve(outputDir, "comments");
  await mkdir(commentDir, { recursive: true });

  const fileName = `${comment.createdAt.replace(/[:.]/g, "-")}.json`;
  const latestPath = path.join(commentDir, "latest.json");
  const datedPath = path.join(commentDir, fileName);

  await Promise.all([writeJson(latestPath, comment), writeJson(datedPath, comment)]);
  return { latestPath, datedPath };
}

export async function ensureDailyIssueAndAppendComment(input: {
  config: AppConfig;
  snapshot: RuntimeSnapshot;
  analysis: RuntimeAnalysis;
  decision: RuntimeDecision;
  review: RuntimeReview;
}): Promise<{ issue: RuntimeDailyIssueRef; comment: RuntimeTradeComment; paths: { latestPath: string; datedPath: string } }> {
  const issue = await ensureDailyIssue(input.config);
  const comment = buildTradeComment({
    snapshot: input.snapshot,
    analysis: input.analysis,
    decision: input.decision,
    review: input.review,
    issue
  });
  await appendTradeComment(input.config, comment);
  const paths = await writeTradeCommentArtifact(comment);
  return { issue, comment, paths };
}

function localizeAction(action: RuntimeDecision["action"]): string {
  if (action === "buy") {
    return "매수";
  }

  if (action === "sell") {
    return "매도";
  }

  return "보류";
}

function summarizeExecutionPlan(decision: RuntimeDecision): string {
  if (decision.executionPlan.mode === "ladder") {
    return decision.executionPlan.splitCount && decision.executionPlan.splitCount > 0
      ? `분할 ${decision.executionPlan.splitCount}단 계획`
      : "분할 진입 계획";
  }

  if (decision.executionPlan.mode === "single") {
    return "단일 실행 계획";
  }

  return "추가 실행 계획 없음";
}

function formatKstTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date).replace(/\. /g, "-").replace(/\.$/, " KST");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
