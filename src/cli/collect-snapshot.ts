import { loadConfig } from "../config/env.js";
import { collectRuntimeSnapshot, writeRuntimeSnapshot } from "../runtime/collect/snapshot.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const snapshot = await collectRuntimeSnapshot(config);
  const paths = await writeRuntimeSnapshot(snapshot);
  const selectedTargets = snapshot.market.selectedTargets.length > 0 ? snapshot.market.selectedTargets.join(", ") : "없음";

  console.log(
    [
      "[collect:snapshot] 스냅샷을 저장했습니다.",
      `[collect:snapshot] 대상 코인: ${selectedTargets}`,
      `[collect:snapshot] 저장 위치: ${paths.latestPath}`
    ].join("\n")
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[collect:snapshot] ${message}`);
  process.exitCode = 1;
});
