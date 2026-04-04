import type { AppConfig } from "../config/env.js";
import type { TradeOnceResult } from "../trading/trade-once.js";

import {
  localizeAccountSource,
  localizeMarketDataMode,
  localizeMarketDataSource,
  localizeReportDisplayTitle,
  localizeSelectionMode,
  localizeTradeDecisionForReport,
  localizeWorkflowLabel
} from "./localization.js";

export type ReportKind = "daily" | "monthly";

export interface IssueDraft {
  kind: ReportKind;
  title: string;
  displayTitle: string;
  labels: string[];
  body: string;
  fileName: string;
  periodLabel: string;
}

export function buildIssueDraft(kind: ReportKind, result: TradeOnceResult, config: AppConfig, now: Date = new Date()): IssueDraft {
  const periodLabel = kind === "daily" ? formatDay(now) : formatMonth(now);
  const title = kind === "daily"
    ? `[Daily] Coinone dry-run report - ${periodLabel}`
    : `[Monthly] Coinone dry-run report - ${periodLabel}`;
  const displayTitle = localizeReportDisplayTitle(kind, periodLabel);

  const labels = ["autotrader", "report", kind, "dry-run"];
  const body = buildIssueBody(kind, result, config, periodLabel, now);
  const fileName = `${kind}-${periodLabel}.md`;

  return {
    kind,
    title,
    displayTitle,
    labels,
    body,
    fileName,
    periodLabel
  };
}

function buildIssueBody(kind: ReportKind, result: TradeOnceResult, config: AppConfig, periodLabel: string, now: Date): string {
  const cadenceNote = kind === "daily"
    ? "해당 일자의 단일 드라이런 기준"
    : "해당 월의 단일 드라이런 기준";
  const actionNeededLines = buildActionNeededLines(config);
  const includeActionNeededSection = shouldIncludeActionNeededSection(config, actionNeededLines);
  const selectedTargets = result.selectedTargets.length > 0 ? result.selectedTargets.join(", ") : "없음";
  const decisionRows = result.decisions.length > 0
    ? result.decisions.map((decision) => {
      const localized = localizeTradeDecisionForReport(decision);
      return `| ${[
        decision.target,
        localized.action,
        localized.reason,
        decision.recommendedOrderValueKrw ?? "-",
        buildRiskSummary(decision),
        buildDecisionNote(localized)
      ].map((value) => escapeTableCell(value)).join(" | ")} |`;
    }).join("\n")
    : "| 없음 | - | 생성된 결정이 없습니다. | - | - | - |";
  const accountSummary = buildAccountSummary(result);
  const strategySummary = [
    `기본 프로필 ${localizeStrategyProfile(result.strategyProfiles.defaultProfile)}`,
    `스테이블코인 ${result.strategyProfiles.stablecoinTargets.join(", ") || "없음"}`
  ].join(" / ");

  return [
    `## 요약`,
    `- ${periodLabel} · ${localizeWorkflowLabel(result.workflow)} · ${cadenceNote}`,
    `- 대상 ${selectedTargets} · 데이터 ${localizeMarketDataMode(result.marketDataMode)} / ${localizeMarketDataSource(result.marketDataSource)} · 계좌 ${result.account.configured ? "연결" : "미연결"}`,
    `- 생성 시각: ${now.toISOString()}`,
    "",
    `## 실행 스냅샷`,
    `| 항목 | 값 |`,
    `| --- | --- |`,
    `| 드라이런 | ${result.dryRun ? "활성화" : "비활성화"} |`,
    `| 선택 | ${localizeSelectionMode(result.selectionMode)} / ${selectedTargets} |`,
    `| 전략 | ${strategySummary} |`,
    `| 한도 | 일일 ${result.riskControls.maxDailyBuyKrw} KRW · ${result.riskControls.maxTradesPerDay}회 / 포지션 ${result.riskControls.maxOpenPositions}개 |`,
    `| 계좌 | ${localizeAccountSource(result.account.source)} / ${accountSummary} |`,
    "",
    `## 의사결정`,
    `| 대상 | 액션 | 핵심 사유 | 주문 KRW | 메모 |`,
    `| --- | --- | --- | --- | --- |`,
    simplifyDecisionRows(decisionRows),
    ...(includeActionNeededSection
      ? ["", `## 확인 필요`, ...actionNeededLines]
      : [])
  ].join("\n");
}

function buildRiskSummary(decision: TradeOnceResult["decisions"][number]): string {
  const cooldown = decision.risk.cooldownMinutesRemaining !== undefined
    ? `쿨다운 ${decision.risk.cooldownMinutesRemaining}분`
    : "쿨다운 -";

  return [
    `일일 ${decision.risk.remainingDailyBuyKrw} KRW`,
    `거래 ${decision.risk.remainingTradesToday}회`,
    cooldown
  ].join(" / ");
}

function buildDecisionNote(localized: ReturnType<typeof localizeTradeDecisionForReport>): string {
  if (localized.holdReasons.length > 0) {
    return `홀드: ${localized.holdReasons[0]}`;
  }

  if (localized.executionBlockedReasons.length > 0) {
    return `차단: ${localized.executionBlockedReasons[0]}`;
  }

  return localized.signalSummary;
}

function localizeStrategyProfile(profile: TradeOnceResult["strategyProfiles"]["defaultProfile"]): string {
  return profile === "default" ? "기본" : "스테이블코인";
}

function buildAccountSummary(result: TradeOnceResult): string {
  if (result.account.balancesPreview.length === 0) {
    return "잔고 미포함";
  }

  return result.account.balancesPreview
    .slice(0, 3)
    .map((balance) => `${balance.currency} ${balance.available ?? "-"}`)
    .join(", ");
}

function escapeTableCell(value: string | number): string {
  return String(value).replace(/\|/g, "\\|");
}

function shouldIncludeActionNeededSection(config: AppConfig, lines: string[]): boolean {
  if (!config.githubCreateIssues) {
    return true;
  }

  return !(lines.length === 1 && lines[0] === "- 보고서 전달에 필요한 추가 작업은 없습니다.");
}

function simplifyDecisionRows(rows: string): string {
  return rows
    .split("\n")
    .map((row) => {
      const parts = row.split("|").map((part) => part.trim());
      if (parts.length < 8) {
        return row;
      }

      return `| ${parts[1]} | ${parts[2]} | ${parts[3]} | ${parts[4]} | ${parts[6]} |`;
    })
    .join("\n");
}

function buildActionNeededLines(config: AppConfig): string[] {
  if (!config.githubCreateIssues) {
    return ["- 이번 실행에서는 GitHub 이슈 자동 생성을 비활성화했으므로 마크다운 초안만 생성됩니다."];
  }

  const missing: string[] = [];

  if (!config.githubRepository) {
    missing.push("- GitHub 이슈 생성을 활성화하려면 `GITHUB_REPOSITORY=owner/repo`를 설정하세요.");
  }

  if (!config.githubToken) {
    missing.push("- 이슈를 자동 생성하려면 repo 이슈 권한이 있는 `GITHUB_TOKEN`을 설정하세요.");
  }

  if (!config.slackWebhookUrl) {
    missing.push("- 이슈 링크나 확인 필요 알림을 Slack으로 보내려면 `SLACK_WEBHOOK_URL`을 설정하세요.");
  }

  if (missing.length === 0) {
    return ["- 보고서 전달에 필요한 추가 작업은 없습니다."];
  }

  return [
    "- 아래 설정이 없으면 자동 전달이 일부 제한됩니다:",
    ...missing
  ];
}

function formatDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatMonth(value: Date): string {
  return value.toISOString().slice(0, 7);
}
