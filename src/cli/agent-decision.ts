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
      `[agent:decision] 실행 기록=${result.execution.status} 차단=${result.execution.executionPlan.executionBlocked} executionId=${result.execution.executionId}`,
      `[agent:decision] 산출물 decision=${result.output.decisionLatestPath} execution=${result.output.executionLatestPath}`
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
