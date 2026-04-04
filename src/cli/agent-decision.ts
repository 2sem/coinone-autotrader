import { loadConfig } from "../config/env.js";
import { runAgentDecisionDryRun } from "../agent/decision-runner.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const result = await runAgentDecisionDryRun(config);
  const userFacing = result.decision.userFacing;

  console.log(
    [
      `[agent:decision] ${userFacing.headline}`,
      `[agent:decision] ${userFacing.summary}`,
      `[agent:decision] 실제 주문은 하지 않았고 판단 결과만 저장했습니다.`,
      `[agent:decision] 저장 위치: 판단 ${result.output.decisionLatestPath}`,
      `[agent:decision] 저장 위치: 실행 기록 ${result.output.executionLatestPath}`
    ].join("\n")
  );
  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[agent:decision] ${message}`);
  process.exitCode = 1;
}
