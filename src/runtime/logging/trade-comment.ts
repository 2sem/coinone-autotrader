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
    `- 이유: ${resolveUserFacingReason(input.decision, input.review)}`,
    `- 검토 결과: ${input.review.approved ? "승인" : "보류"}`,
    `- 상태: ${summarizeRunResult(input.decision, input.review)}`,
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
    userSummaryKo: resolveUserFacingReason(input.decision, input.review)
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

function summarizeRunResult(decision: RuntimeDecision, review: RuntimeReview): string {
  if (!review.approved) {
    return `pending (${inferPendingReason(decision, review)})`;
  }

  if (decision.action === "hold") {
    return `pending (${inferPendingReason(decision, review)})`;
  }

  return "trade";
}

function resolveUserFacingReason(decision: RuntimeDecision, review: RuntimeReview): string {
  if (!isGenericHoldReason(decision.userSummaryKo)) {
    return decision.userSummaryKo;
  }

  const cooldownNote = decision.riskNotes.find((note) => note.toLowerCase().includes("cooldown"));
  if (cooldownNote) {
    const match = cooldownNote.match(/(\d+) more minutes/i);
    if (match) {
      return `${decision.target ?? "선택 코인"}은 최근 체결 이후 쿨다운이 ${match[1]}분 남아 있어 이번에는 기다립니다.`;
    }

    return `${decision.target ?? "선택 코인"}은 최근 체결 이후 쿨다운 구간에 있어 이번에는 기다립니다.`;
  }

  if (!review.approved) {
    if (review.blockedReasons.length > 0) {
      return `검토 단계에서 ${translateBlockedReason(review.blockedReasons[0])} 사유로 보류했습니다.`;
    }

    return "검토 단계에서 추가 확인이 필요해 이번에는 보류했습니다.";
  }

  if (decision.action === "hold") {
    return `${decision.target ?? "선택 코인"}은 현재 조건에서 뚜렷한 진입 근거가 부족해 이번에는 기다립니다.`;
  }

  return decision.userSummaryKo;
}

function isGenericHoldReason(value: string): boolean {
  return value.includes("기본 안전 판단상 보류") || value.includes("AI가 최종 판단") || value.includes("초안") || value.includes("보수적으로 보류");
}

function translateBlockedReason(reason: string): string {
  if (reason.toLowerCase().includes("placeholder")) {
    return "AI 판단 내용이 충분히 채워지지 않은";
  }

  if (reason.toLowerCase().includes("confidence")) {
    return "확신도가 충분하지 않은";
  }

  if (reason.toLowerCase().includes("execution plan")) {
    return "실행 계획이 불완전한";
  }

  return "안전 규칙을 다시 확인해야 하는";
}

function inferPendingReason(decision: RuntimeDecision, review: RuntimeReview): string {
  if (!review.approved && review.operatorActionRequired) {
    return "review-blocked";
  }

  if (decision.userSummaryKo.includes("쿨다운") || decision.userSummaryKo.includes("기다립니다")) {
    return "cooldown";
  }

  if (decision.userSummaryKo.includes("잔고")) {
    return "balance";
  }

  return "hold";
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
