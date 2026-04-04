import { loadConfig } from "../config/env.js";
import { runReport } from "../reporting/report-runner.js";

function parseReportKind(value: string | undefined): "daily" | "monthly" {
  if (value === "daily" || value === "monthly") {
    return value;
  }

  throw new Error("Usage: tsx src/cli/report.ts <daily|monthly>");
}

async function main(): Promise<void> {
  const kind = parseReportKind(process.argv[2]);
  const config = loadConfig();
  const result = await runReport(kind, config);

  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[report] ${message}`);
  process.exitCode = 1;
}
