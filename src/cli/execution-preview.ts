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
      `[execution:preview] 실행 후보=${executableEntries.length}건 저장=${result.output.previewLatestPath}`,
      `[execution:preview] 라이브 주문은 항상 차단되며 실제 전송은 수행하지 않습니다.`
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
