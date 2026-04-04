import { loadConfig } from "../config/env.js";
import { readLatestSnapshotAndDecision, runRuntimeRuleValidation, writeRuntimeRuleValidation } from "../runtime/validate/rule-validation.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const { snapshot, decision } = await readLatestSnapshotAndDecision();
  const validation = runRuntimeRuleValidation(snapshot, decision, config);
  const paths = await writeRuntimeRuleValidation(validation);

  console.log(
    [
      "[rule:validate] 기본 안전 규칙 점검 결과를 저장했습니다.",
      `[rule:validate] 통과 여부: ${validation.passed ? "통과" : "보완 필요"}`,
      `[rule:validate] 요약: ${validation.summaryKo}`,
      `[rule:validate] 저장 위치: ${paths.latestPath}`
    ].join("\n")
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[rule:validate] ${message}`);
  process.exitCode = 1;
});
