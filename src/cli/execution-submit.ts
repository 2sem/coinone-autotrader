import { loadConfig } from "../config/env.js";
import { runExecutionSubmit } from "../execution/submit.js";

function readOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const result = await runExecutionSubmit(config, {
    previewId: readOption("preview-id"),
    approvalId: readOption("approval-id")
  });
  const submittedCount = result.submit.submittedEntries.filter((entry) => entry.status === "submitted").length;

  console.log(
    [
      `[execution:submit] ${result.submit.summary.headline}`,
      `[execution:submit] ${result.submit.summary.summary}`,
      `[execution:submit] previewId: ${result.submit.previewId}`,
      `[execution:submit] approvalId: ${result.submit.approvalId ?? "없음"}`,
      `[execution:submit] 모의 제출 건수: ${submittedCount}`,
      `[execution:submit] 저장 위치: ${result.output.latestPath}`,
      `[execution:submit] 실제 Coinone 주문은 전송하지 않았습니다.`
    ].join("\n")
  );
  console.log(JSON.stringify(result, null, 2));

  if (result.submit.finalStatus === "blocked") {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[execution:submit] 제출 검증에 실패했습니다: ${message}`);
  process.exitCode = 1;
}
