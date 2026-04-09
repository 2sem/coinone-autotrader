import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { GitHubRepository } from "../config/env.js";

const execFileAsync = promisify(execFile);

export async function resolveGitHubRepository(repository: GitHubRepository | undefined): Promise<GitHubRepository> {
  if (repository) {
    return repository;
  }

  const { stdout } = await execFileAsync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 1024 * 1024
  });

  const fullName = stdout.trim();
  const [owner, name] = fullName.split("/");
  if (!owner || !name) {
    throw new Error("Unable to resolve GitHub repository from gh repo view.");
  }

  return {
    owner,
    name,
    fullName
  };
}
