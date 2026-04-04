import { loadConfig } from "../config/env.js";
import { readLatestRuntimeInputs, runRuntimeDecision, writeRuntimeDecision } from "../runtime/decide/decision-run.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const { snapshot, analysis } = await readLatestRuntimeInputs();
  const decision = runRuntimeDecision(snapshot, analysis, config);
  const paths = await writeRuntimeDecision(decision);

  console.log(
    [
      "[decision:run] 의사결정 결과를 저장했습니다.",
      `[decision:run] 판단: ${decision.target ?? "선택 코인"} ${localizeAction(decision.action)}`,
      `[decision:run] 요약: ${decision.userSummaryKo}`,
      `[decision:run] 저장 위치: ${paths.latestPath}`
    ].join("\n")
  );
}

function localizeAction(action: "buy" | "sell" | "hold"): string {
  if (action === "buy") {
    return "매수";
  }

  if (action === "sell") {
    return "매도";
  }

  return "보류";
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[decision:run] ${message}`);
  process.exitCode = 1;
});
