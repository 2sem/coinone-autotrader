import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { AppConfig } from "../../config/env.js";
import { patchIssueWithGh } from "../../reporting/github-issues.js";
import { resolveGitHubRepository } from "../../reporting/github-repository.js";
import { buildDailyIssueTitle, ensureDailyIssue } from "../logging/daily-issue.js";

const execFileAsync = promisify(execFile);

export interface DailyRefreshResult {
  issueNumber: number;
  issueUrl: string;
  title: string;
  commentCount: number;
  updated: boolean;
}

export async function refreshDailyIssueBody(config: AppConfig, date: Date = new Date()): Promise<DailyRefreshResult> {
  const repository = await resolveGitHubRepository(config.githubRepository);

  const issue = await ensureDailyIssue(config, date);
  const comments = await listIssueComments(repository.owner, repository.name, issue.issueNumber);
  const body = buildDailyRefreshBody(date, comments);

  await patchIssueWithGh(
    issue.issueNumber,
    {
      kind: "daily",
      title: issue.title,
      displayTitle: issue.title,
      labels: ["autotrader", "trade-log", "daily"],
      body,
      fileName: "",
      periodLabel: formatDay(date)
    },
    repository
  );

  return {
    issueNumber: issue.issueNumber,
    issueUrl: issue.issueUrl,
    title: buildDailyIssueTitle(date),
    commentCount: comments.length,
    updated: true
  };
}

async function listIssueComments(owner: string, repo: string, issueNumber: number): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "gh",
    ["api", `repos/${owner}/${repo}/issues/${issueNumber}/comments`, "--paginate"],
    { cwd: process.cwd(), env: process.env, maxBuffer: 4 * 1024 * 1024 }
  );

  const payload = JSON.parse(stdout) as Array<{ body?: string }>;
  return payload.map((entry) => entry.body ?? "").filter(Boolean);
}

function buildDailyRefreshBody(date: Date, comments: string[]): string {
  const parsed = comments.map(parseTradeComment).filter((entry): entry is ParsedComment => Boolean(entry));
  const latest = parsed.at(-1);
  const buys = parsed.filter((entry) => entry.action === "매수").length;
  const sells = parsed.filter((entry) => entry.action === "매도").length;
  const holds = parsed.filter((entry) => entry.action === "보류").length;

  return [
    "## 요약",
    `- 날짜: ${formatDay(date)}`,
    `- 총 실행 기록: ${parsed.length}건`,
    latest ? `- 최근 판단: ${latest.target} ${latest.action} (${latest.status})` : "- 최근 판단: 아직 없음",
    "",
    "## 누적 요약",
    `- 매수 ${buys}건 / 매도 ${sells}건 / 보류 ${holds}건`,
    latest ? `- 최근 메모: ${latest.note}` : "- 최근 메모: 아직 없음",
    "",
    "## 최근 실행",
    ...(latest
      ? [
          `- 시각: ${latest.heading}`,
          `- 코인: ${latest.target}`,
          `- 판단: ${latest.action}`,
          `- 상태: ${latest.status}`,
          `- 이유: ${latest.reason}`,
          `- 검토 결과: ${latest.review}`
        ]
      : ["- 아직 기록이 없습니다."])
  ].join("\n");
}

interface ParsedComment {
  heading: string;
  target: string;
  action: string;
  status: string;
  reason: string;
  review: string;
  note: string;
}

function parseTradeComment(body: string): ParsedComment | undefined {
  const lines = body.split("\n");
  if (lines.length < 6 || !lines[0]?.startsWith("### ")) {
    return undefined;
  }

  const getValue = (prefix: string) => lines.find((line) => line.startsWith(prefix))?.replace(prefix, "").trim() ?? "";

  return {
    heading: lines[0].replace(/^###\s*/, "").trim(),
    target: getValue("- 코인: "),
    action: getValue("- 판단: "),
    status: sanitizeCommentValue(getValue("- 상태: ")) || inferStatusFromLegacy(getValue("- 판단: "), getValue("- 검토 결과: "), getValue("- 이유: ")),
    reason: sanitizeCommentValue(getValue("- 이유: ")),
    review: getValue("- 검토 결과: "),
    note: sanitizeCommentValue(getValue("- 다음 메모: "))
  };
}

function sanitizeCommentValue(value: string): string {
  if (
    value.includes("초안") ||
    value.toLowerCase().includes("replace this placeholder") ||
    value.includes("기본 안전 판단상 보류")
  ) {
    return "AI 판단 결과가 완전히 채워지지 않아 보수적으로 보류했습니다.";
  }

  return value;
}

function inferStatusFromLegacy(action: string, review: string, reason: string): string {
  if (review === "보류") {
    return reason.includes("쿨다운") ? "pending (cooldown)" : "pending (review-blocked)";
  }

  if (action === "보류") {
    return reason.includes("쿨다운") ? "pending (cooldown)" : "pending (hold)";
  }

  return "trade";
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
