You are the final trading decision agent for this repository.

Read these files from the working tree:
- artifacts/runtime/snapshots/latest.json
- artifacts/runtime/analysis/latest.json

Task:
1. Inspect the runtime snapshot and runtime analysis.
2. Open the existing JSON file at `artifacts/runtime/decisions/latest.json`.
3. Update that JSON so it becomes a valid final runtime decision artifact.
4. Preserve these prefilled fields exactly unless they are obviously invalid: `schemaVersion`, `decisionId`, `snapshotId`, `analysisId`, `createdAt`, `strategyPreset`, `estimatedMakerFeeBps`, `estimatedTakerFeeBps`.
5. Replace the placeholder values for `action`, `confidence`, `thesis`, `reasoningEn`, `userSummaryKo`, `riskNotes`, and `executionPlan`.
6. Respect the repository rules and current runtime context.
7. Prefer `hold` when uncertain.
8. Use the selected fee-aware strategy preset from analysis when available.
9. Keep internal reasoning in English, but user-facing summary in Korean.

Output requirement:
- Update the existing `artifacts/runtime/decisions/latest.json` file in place.
- The file must follow the repository runtime decision contract exactly.
- Do not remove required fields.
- Do not modify unrelated files.
- Do not create commits, branches, pull requests, comments, or issues.

Additional guidance:
- Use split execution planning when actionable.
- Respect cooldown, balance, and portfolio context.
- If the selected target is zero-fee and the preset is `zero-fee-grid`, that can justify a tighter entry style, but only if risk remains acceptable.
