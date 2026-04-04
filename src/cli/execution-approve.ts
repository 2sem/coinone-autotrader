import { loadConfig } from "../config/env.js";
import { runExecutionApproval } from "../execution/approval.js";

function readOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const result = await runExecutionApproval(config, {
    previewId: readOption("preview-id")
  });

  console.log(
    [
      `[execution:approve] ${result.approval.summary.headline}`,
      `[execution:approve] ${result.approval.summary.summary}`,
      `[execution:approve] previewId: ${result.approval.previewId}`,
      `[execution:approve] 만료 시각: ${result.approval.expiresAt}`,
      `[execution:approve] 저장 위치: ${result.output.latestPath}`,
      `[execution:approve] 실제 주문은 하지 않았습니다.`
    ].join("\n")
  );
  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[execution:approve] 승인 기록 생성에 실패했습니다: ${message}`);
  process.exitCode = 1;
}
