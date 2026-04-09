import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const CLI_REPO_URL = "https://github.com/2sem/coinone-api-cli.git";
const CLI_COMMIT = "957f6733162021d0cfe12a5cdab61daafc577f21";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const vendorRoot = path.join(projectRoot, ".vendor");
const checkoutDir = path.join(vendorRoot, "coinone-api-cli");

async function main() {
  await mkdir(vendorRoot, { recursive: true });

  if (existsSync(checkoutDir)) {
    await rm(checkoutDir, { recursive: true, force: true });
  }

  await run("git", ["clone", CLI_REPO_URL, checkoutDir], projectRoot);
  await run("git", ["checkout", CLI_COMMIT], checkoutDir);
  await run("npm", ["install"], checkoutDir);
  await run("npm", ["run", "build"], checkoutDir);

  const cliEntry = path.join(checkoutDir, "dist", "bin", "coinone.js");

  if (!existsSync(cliEntry)) {
    throw new Error(`coinone CLI build completed without ${cliEntry}`);
  }

  process.stdout.write(
    [
      `Installed coinone-api-cli at ${checkoutDir}`,
      `Pinned commit: ${CLI_COMMIT}`,
      `CLI entrypoint: ${cliEntry}`
    ].join("\n") + "\n"
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[coinone:install] ${message}\n`);
  process.exitCode = 1;
});

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: false
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}
