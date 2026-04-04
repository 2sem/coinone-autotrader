import { loadConfig } from "../config/env.js";
import { runTradeOnce } from "../trading/trade-once.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const result = await runTradeOnce(config);

  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[trade:once] ${message}`);
  process.exitCode = 1;
}
