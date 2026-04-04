import { readFile } from "node:fs/promises";

async function main() {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const summaryPath = process.argv[2];
  const title = process.argv[3] ?? "coinone-autotrader 알림";

  if (!webhookUrl || !summaryPath) {
    return;
  }

  const summary = await readFile(summaryPath, "utf8");
  const runUrl = buildRunUrl();
  const text = [
    `*${title}*`,
    runUrl ? `<${runUrl}|워크플로 실행 보기>` : null,
    "```",
    summary.trim().slice(0, 2800),
    "```"
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ text: needsMentionHere(title) ? `<!here>\n${text}` : text })
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(`Slack webhook request failed with ${response.status}: ${responseText || response.statusText}`);
  }
}

function needsMentionHere(title) {
  return title.includes("확인이 필요") || title.includes("조치 필요") || title.includes("실패");
}

function buildRunUrl() {
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;

  if (!serverUrl || !repository || !runId) {
    return "";
  }

  return `${serverUrl}/${repository}/actions/runs/${runId}`;
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
