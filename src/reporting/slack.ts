import type { AppConfig } from "../config/env.js";

export interface SlackMessage {
  text: string;
  mentionHere?: boolean;
}

export interface SlackDeliveryResult {
  attempted: boolean;
  delivered: boolean;
  reason?: string;
}

export type SlackNotificationEvent =
  | "routine-preview"
  | "routine-dry-run"
  | "approval-needed"
  | "action-needed"
  | "daily-report"
  | "monthly-report"
  | "live-submit";

export function shouldSendSlackNotification(config: AppConfig, event: SlackNotificationEvent): boolean {
  switch (event) {
    case "routine-preview":
      return config.slackNotificationPolicy.routinePreview;
    case "routine-dry-run":
      return config.slackNotificationPolicy.routineDryRun;
    case "approval-needed":
      return config.slackNotificationPolicy.approvalNeeded;
    case "action-needed":
      return config.slackNotificationPolicy.actionNeeded;
    case "daily-report":
      return config.slackNotificationPolicy.dailyReport;
    case "monthly-report":
      return config.slackNotificationPolicy.monthlyReport;
    case "live-submit":
      return config.slackNotificationPolicy.liveSubmit;
  }
}

export function buildSlackSuppressedResult(event: SlackNotificationEvent): SlackDeliveryResult {
  return {
    attempted: false,
    delivered: false,
    reason: `Slack notification suppressed by policy for ${event}.`
  };
}

export async function sendSlackMessage(message: SlackMessage, webhookUrl?: string): Promise<SlackDeliveryResult> {
  if (!webhookUrl) {
    return {
      attempted: false,
      delivered: false,
      reason: "SLACK_WEBHOOK_URL is not configured."
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ text: prefixHereMention(message.text, message.mentionHere === true) })
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Slack webhook request failed with ${response.status}: ${responseText || response.statusText}`);
  }

  return {
    attempted: true,
    delivered: true,
    reason: responseText.trim() === "" ? undefined : responseText.trim()
  };
}

function prefixHereMention(text: string, mentionHere: boolean): string {
  if (!mentionHere) {
    return text;
  }

  return text.startsWith("<!here>") ? text : `<!here>\n${text}`;
}
