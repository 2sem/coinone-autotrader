import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppConfig } from "../config/env.js";
import { runTradeOnce } from "../trading/trade-once.js";

import { buildManualIssueUrl, upsertGitHubIssue } from "./github-issues.js";
import { buildIssueDraft, type ReportKind } from "./issues.js";
import {
  buildSlackSuppressedResult,
  sendSlackMessage,
  shouldSendSlackNotification,
  type SlackDeliveryResult,
  type SlackNotificationEvent
} from "./slack.js";

export interface ReportRunResult {
  kind: ReportKind;
  title: string;
  displayTitle: string;
  labels: string[];
  markdownPath: string;
  manualIssueUrl?: string;
  github: {
    attempted: boolean;
    created: boolean;
    updated: boolean;
    issueNumber?: number;
    issueUrl?: string;
    reason?: string;
  };
  slack: SlackDeliveryResult;
  actionNeeded: {
    required: boolean;
    reasons: string[];
  };
  tradeRun: Awaited<ReturnType<typeof runTradeOnce>>;
}

export async function runReport(kind: ReportKind, config: AppConfig): Promise<ReportRunResult> {
  const tradeRun = await runTradeOnce(config);
  const draft = buildIssueDraft(kind, tradeRun, config);
  const markdownPath = await writeIssueDraft(config.reportOutputDir, draft.fileName, draft.body);
  const manualIssueUrl = buildManualIssueUrl(draft, config.githubRepository);
  const actionReasons = collectActionReasons(config);

  let githubResult: ReportRunResult["github"] = {
    attempted: false,
    created: false,
    updated: false,
    reason: actionReasons.length > 0 ? actionReasons.join(" ") : undefined
  };

  if (actionReasons.length === 0 && config.githubRepository) {
    const upsertedIssue = await upsertGitHubIssue(draft, config.githubRepository, config.githubToken, config.githubApiBaseUrl);
    githubResult = {
      attempted: true,
      created: upsertedIssue.created,
      updated: upsertedIssue.updated,
      issueNumber: upsertedIssue.number,
      issueUrl: upsertedIssue.url
    };
  }

  const slackMessage = githubResult.created || githubResult.updated
    ? buildReportCreatedSlackMessage(draft.displayTitle, githubResult.issueUrl, githubResult.created)
    : buildActionNeededSlackMessage(draft.displayTitle, markdownPath, manualIssueUrl, actionReasons);
  const slackEvent = resolveReportSlackEvent(kind, actionReasons);
  const slack = shouldSendSlackNotification(config, slackEvent)
    ? await sendSlackMessage({ text: slackMessage, mentionHere: actionReasons.length > 0 }, config.slackWebhookUrl)
    : buildSlackSuppressedResult(slackEvent);

  return {
    kind,
    title: draft.title,
    displayTitle: draft.displayTitle,
    labels: draft.labels,
    markdownPath,
    manualIssueUrl,
    github: githubResult,
    slack,
    actionNeeded: {
      required: actionReasons.length > 0,
      reasons: actionReasons
    },
    tradeRun
  };
}

async function writeIssueDraft(outputDir: string, fileName: string, body: string): Promise<string> {
  const absoluteDir = path.resolve(process.cwd(), outputDir);
  await mkdir(absoluteDir, { recursive: true });

  const absolutePath = path.join(absoluteDir, fileName);
  await writeFile(absolutePath, body, "utf8");
  return absolutePath;
}

function collectActionReasons(config: AppConfig): string[] {
  const reasons: string[] = [];

  if (!config.githubCreateIssues) {
    return reasons;
  }

  if (!config.githubRepository) {
    reasons.push("GITHUB_REPOSITORY가 없습니다.");
  }

  return reasons;
}

function buildReportCreatedSlackMessage(title: string, issueUrl: string | undefined, created: boolean): string {
  const linkedTitle = issueUrl ? `<${issueUrl}|${title}>` : title;
  return [
    linkedTitle,
    created ? "- 보고서를 새로 올렸습니다." : "- 보고서를 최신 내용으로 바꿨습니다."
  ].filter(Boolean).join("\n");
}

function buildActionNeededSlackMessage(title: string, markdownPath: string, manualIssueUrl: string | undefined, reasons: string[]): string {
  const lines = [
    `${title} 확인이 필요합니다.`,
    ...reasons.map((reason) => `- ${reason}`),
    `- 보고서 초안 위치: ${markdownPath}`
  ];

  if (manualIssueUrl) {
    lines.push(`- 직접 보고서를 올리려면: ${manualIssueUrl}`);
  }

  return lines.join("\n");
}

function resolveReportSlackEvent(kind: ReportKind, actionReasons: string[]): SlackNotificationEvent {
  if (actionReasons.length > 0) {
    return "action-needed";
  }

  return kind === "daily" ? "daily-report" : "monthly-report";
}
