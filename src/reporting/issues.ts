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
    ? "오늘 기준으로 한 번 점검한 결과"
    : "이번 달 기준으로 한 번 점검한 결과";
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
    `- 이번에 본 코인: ${selectedTargets}`,
    `- 시세 기준: ${localizeMarketDataMode(result.marketDataMode)} / ${localizeMarketDataSource(result.marketDataSource)} · 계좌 확인: ${result.account.configured ? "완료" : "안 함"}`,
    `- 생성 시각: ${now.toISOString()}`,
    "",
    `## 실행 스냅샷`,
    `| 항목 | 값 |`,
    `| --- | --- |`,
    `| 실행 방식 | ${result.dryRun ? "모의 실행" : "실제 실행"} |`,
    `| 코인 선택 | ${localizeSelectionMode(result.selectionMode)} / ${selectedTargets} |`,
    `| 기본 전략 | ${strategySummary} |`,
    `| 안전 기준 | 하루 ${result.riskControls.maxDailyBuyKrw} KRW · ${result.riskControls.maxTradesPerDay}회 / 보유 ${result.riskControls.maxOpenPositions}개 |`,
    `| 계좌 정보 | ${localizeAccountSource(result.account.source)} / ${accountSummary} |`,
    "",
    `## 의사결정`,
    `| 코인 | 판단 | 이유 | 계산된 주문금액 | 메모 |`,
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
      return ["- 이번에는 GitHub 보고서를 자동으로 올리지 않고 초안만 만들었습니다."];
  }

  const missing: string[] = [];

  if (!config.githubRepository) {
      missing.push("- GitHub 보고서를 올릴 저장소를 먼저 정해주세요. (`GITHUB_REPOSITORY=owner/repo`)");
  }

  if (!config.githubToken) {
      missing.push("- 자동 보고에 필요한 GitHub 권한을 확인해주세요.");
  }

  if (!config.slackWebhookUrl) {
      missing.push("- Slack으로 링크와 알림을 받으려면 `SLACK_WEBHOOK_URL`을 설정하세요.");
  }

  if (missing.length === 0) {
      return ["- 추가로 할 일은 없습니다."];
  }

  return [
    "- 아래 항목이 없으면 자동 전달이 제한될 수 있습니다:",
    ...missing
  ];
}

function formatDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatMonth(value: Date): string {
  return value.toISOString().slice(0, 7);
}
