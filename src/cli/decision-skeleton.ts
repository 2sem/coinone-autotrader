import { readLatestRuntimeInputs } from "../runtime/decide/decision-run.js";
import { createRuntimeDecisionSkeleton, writeRuntimeDecisionSkeleton } from "../runtime/decide/decision-skeleton.js";

async function main(): Promise<void> {
  const { snapshot, analysis } = await readLatestRuntimeInputs();
  const decision = createRuntimeDecisionSkeleton(snapshot, analysis);
  const paths = await writeRuntimeDecisionSkeleton(decision);

  console.log(
    [
      "[decision:skeleton] AI decision 초안을 저장했습니다.",
      `[decision:skeleton] 저장 위치: ${paths.latestPath}`
    ].join("\n")
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[decision:skeleton] ${message}`);
  process.exitCode = 1;
});
