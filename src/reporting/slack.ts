export interface SlackMessage {
  text: string;
  mentionHere?: boolean;
}

export interface SlackDeliveryResult {
  attempted: boolean;
  delivered: boolean;
  reason?: string;
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
