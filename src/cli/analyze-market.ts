import { readLatestRuntimeSnapshot } from "../runtime/collect/snapshot.js";
import { analyzeRuntimeSnapshot, writeRuntimeAnalysis } from "../runtime/analyze/market-analysis.js";

async function main(): Promise<void> {
  const snapshot = await readLatestRuntimeSnapshot();
  const analysis = analyzeRuntimeSnapshot(snapshot);
  const paths = await writeRuntimeAnalysis(analysis);

  console.log(
    [
      "[analyze:market] 시장 분석을 저장했습니다.",
      `[analyze:market] 요약: ${analysis.userSummaryKo}`,
      `[analyze:market] 저장 위치: ${paths.latestPath}`
    ].join("\n")
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[analyze:market] ${message}`);
  process.exitCode = 1;
});
