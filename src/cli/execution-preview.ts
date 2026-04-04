import { loadConfig } from "../config/env.js";
import { runExecutionPreview } from "../execution/preview.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const result = await runExecutionPreview(config);
  const executableEntries = result.preview.entries.filter((entry) => entry.action !== "hold");

  console.log(
    [
      `[execution:preview] ${result.preview.summary.headline}`,
      `[execution:preview] ${result.preview.summary.summary}`,
      `[execution:preview] 주문 미리보기 ${executableEntries.length}건을 저장했습니다.`,
      `[execution:preview] 저장 위치: ${result.output.previewLatestPath}`,
      `[execution:preview] 실제 주문은 하지 않았습니다.`
    ].join("\n")
  );
  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[execution:preview] ${message}`);
  process.exitCode = 1;
}
