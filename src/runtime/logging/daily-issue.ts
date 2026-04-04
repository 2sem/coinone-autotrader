import type { AppConfig } from "../../config/env.js";
import { createIssueWithGh, findOpenIssueByExactTitleWithGh } from "../../reporting/github-issues.js";

export interface RuntimeDailyIssueRef {
  issueNumber: number;
  issueUrl: string;
  created: boolean;
  title: string;
}

export async function ensureDailyIssue(config: AppConfig, date: Date = new Date()): Promise<RuntimeDailyIssueRef> {
  if (!config.githubRepository) {
    throw new Error("GITHUB_REPOSITORY is required for daily issue logging.");
  }

  const title = buildDailyIssueTitle(date);
  const existing = await findOpenIssueByExactTitleWithGh(title, config.githubRepository);

  if (existing) {
    return {
      issueNumber: existing.number,
      issueUrl: existing.url,
      created: false,
      title
    };
  }

  const created = await createIssueWithGh(
    {
      kind: "daily",
      title,
      displayTitle: title,
      labels: ["autotrader", "trade-log", "daily"],
      body: buildDailyIssueBody(date),
      fileName: "",
      periodLabel: formatDay(date)
    },
    config.githubRepository
  );

  return {
    issueNumber: created.number,
    issueUrl: created.url,
    created: true,
    title
  };
}

export function buildDailyIssueTitle(date: Date): string {
  return `[Daily] Coinone trading log - ${formatDay(date)}`;
}

function buildDailyIssueBody(date: Date): string {
  return [
    "## 요약",
    `- 날짜: ${formatDay(date)}`,
    "- 코인원 자동매매 일일 기록",
    "",
    "## 누적 요약",
    "- 이후 실행 결과가 comment로 추가됩니다."
  ].join("\n");
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
