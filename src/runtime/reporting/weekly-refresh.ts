import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { AppConfig } from "../../config/env.js";
import { createIssueWithGh, findOpenIssueByExactTitleWithGh, patchIssueWithGh } from "../../reporting/github-issues.js";

const execFileAsync = promisify(execFile);
const DAILY_TITLE_PREFIX = "[Daily] Coinone trading log - ";

export interface WeeklyRefreshResult {
  issueNumber: number;
  issueUrl: string;
  title: string;
  dailyIssueCount: number;
  totalComments: number;
}

export async function refreshWeeklyIssueBody(config: AppConfig, date: Date = new Date()): Promise<WeeklyRefreshResult> {
  if (!config.githubRepository) {
    throw new Error("GITHUB_REPOSITORY is required for weekly refresh.");
  }

  const owner = config.githubRepository.owner;
  const repo = config.githubRepository.name;
  const weekRange = getKstWeekRange(date);
  const dailyIssues = (await listDailyIssues(owner, repo)).filter((issue) => {
    const parsed = parseDailyDate(issue.title);
    return parsed !== undefined && parsed >= weekRange.start && parsed <= weekRange.end;
  });

  const totalCommentsByIssue = await Promise.all(
    dailyIssues.map(async (issue) => ({ issue, comments: await listIssueComments(owner, repo, issue.number) }))
  );

  const totalComments = totalCommentsByIssue.reduce((sum, entry) => sum + entry.comments.length, 0);
  const title = buildWeeklyIssueTitle(date);
  const body = buildWeeklyRefreshBody(date, weekRange, totalCommentsByIssue);
  const existing = await findOpenIssueByExactTitleWithGh(title, config.githubRepository);
  const labels = ["autotrader", "weekly", "summary"];

  const issue = existing
    ? await patchIssueWithGh(
        existing.number,
        { kind: "daily", title, displayTitle: title, labels, body, fileName: "", periodLabel: title },
        config.githubRepository
      )
    : await createIssueWithGh(
        { kind: "daily", title, displayTitle: title, labels, body, fileName: "", periodLabel: title },
        config.githubRepository
      );

  return {
    issueNumber: issue.number,
    issueUrl: issue.url,
    title,
    dailyIssueCount: dailyIssues.length,
    totalComments
  };
}

interface IssueListItem {
  number: number;
  title: string;
  body: string;
  url: string;
}

async function listDailyIssues(owner: string, repo: string): Promise<IssueListItem[]> {
  const { stdout } = await execFileAsync(
    "gh",
    ["issue", "list", "--repo", `${owner}/${repo}`, "--state", "all", "--limit", "100", "--json", "number,title,body,url"],
    { cwd: process.cwd(), env: process.env, maxBuffer: 4 * 1024 * 1024 }
  );

  const payload = JSON.parse(stdout) as IssueListItem[];
  return payload.filter((issue) => issue.title.startsWith(DAILY_TITLE_PREFIX));
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

function buildWeeklyIssueTitle(date: Date): string {
  const kstDate = toKstDate(date);
  const week = getIsoWeek(kstDate);
  return `[Weekly] Coinone trading summary - ${kstDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function buildWeeklyRefreshBody(
  date: Date,
  weekRange: { start: Date; end: Date },
  entries: Array<{ issue: IssueListItem; comments: string[] }>
): string {
  const totals = entries.reduce(
    (acc, entry) => {
      for (const comment of entry.comments) {
        if (comment.includes("- 판단: 매수")) acc.buys += 1;
        else if (comment.includes("- 판단: 매도")) acc.sells += 1;
        else if (comment.includes("- 판단: 보류")) acc.holds += 1;
      }
      return acc;
    },
    { buys: 0, sells: 0, holds: 0 }
  );

  return [
    "## 주간 요약",
    `- 기간: ${formatDay(weekRange.start)} ~ ${formatDay(weekRange.end)}`,
    `- 일일 이슈 수: ${entries.length}건`,
    `- 실행 댓글 수: ${entries.reduce((sum, entry) => sum + entry.comments.length, 0)}건`,
    "",
    "## 누적 판단",
    `- 매수 ${totals.buys}건 / 매도 ${totals.sells}건 / 보류 ${totals.holds}건`,
    "",
    "## 일자별 링크",
    ...(entries.length > 0
      ? entries.map((entry) => `- ${entry.issue.title.replace(DAILY_TITLE_PREFIX, "")} · ${entry.issue.url}`)
      : ["- 이번 주 일일 기록이 아직 없습니다."])
  ].join("\n");
}

function parseDailyDate(title: string): Date | undefined {
  if (!title.startsWith(DAILY_TITLE_PREFIX)) {
    return undefined;
  }

  const day = title.slice(DAILY_TITLE_PREFIX.length).trim();
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function getKstWeekRange(date: Date): { start: Date; end: Date } {
  const kst = toKstDate(date);
  const day = kst.getUTCDay() || 7;
  const start = new Date(kst);
  start.setUTCDate(kst.getUTCDate() - (day - 1));
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

function toKstDate(date: Date): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function getIsoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
