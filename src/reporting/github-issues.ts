import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { GitHubRepository } from "../config/env.js";

import type { IssueDraft } from "./issues.js";

const execFileAsync = promisify(execFile);

export interface CreatedIssue {
  number: number;
  url: string;
}

export interface UpsertedIssue extends CreatedIssue {
  created: boolean;
  updated: boolean;
}

export async function upsertGitHubIssue(
  draft: IssueDraft,
  repository: GitHubRepository,
  token: string | undefined,
  apiBaseUrl: string
): Promise<UpsertedIssue> {
  const existingIssue = await findOpenIssueByExactTitle(draft.title, repository, token, apiBaseUrl);

  if (existingIssue) {
    const updatedIssue = await patchIssue(existingIssue.number, draft, repository, token, apiBaseUrl);
    return {
      ...updatedIssue,
      created: false,
      updated: true
    };
  }

  const createdIssue = await createIssue(draft, repository, token, apiBaseUrl);
  return {
    ...createdIssue,
    created: true,
    updated: false
  };
}

export function buildManualIssueUrl(draft: IssueDraft, repository?: GitHubRepository): string | undefined {
  if (!repository) {
    return undefined;
  }

  const search = new URLSearchParams({
    title: draft.title,
    body: draft.body,
    labels: draft.labels.join(",")
  });

  return `https://github.com/${repository.owner}/${repository.name}/issues/new?${search.toString()}`;
}

async function findOpenIssueByExactTitle(
  title: string,
  repository: GitHubRepository,
  token: string | undefined,
  apiBaseUrl: string
): Promise<CreatedIssue | undefined> {
  if (!token) {
    return findOpenIssueByExactTitleWithGh(title, repository);
  }

  const baseUrl = apiBaseUrl.replace(/\/$/, "");

  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(
      `${baseUrl}/repos/${repository.owner}/${repository.name}/issues?state=open&per_page=100&page=${page}`,
      {
        method: "GET",
        headers: buildHeaders(token)
      }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload && typeof payload === "object" && "message" in payload ? String(payload.message) : response.statusText;
      throw new Error(`GitHub issue lookup failed with ${response.status}: ${message}`);
    }

    if (!Array.isArray(payload)) {
      throw new Error("GitHub issue lookup returned an unexpected response payload.");
    }

    const matchedIssue = payload.find(
      (issue) =>
        issue &&
        typeof issue === "object" &&
        !("pull_request" in issue) &&
        issue.title === title &&
        "number" in issue &&
        "html_url" in issue
    );

    if (matchedIssue) {
      return {
        number: Number(matchedIssue.number),
        url: String(matchedIssue.html_url)
      };
    }

    if (payload.length < 100) {
      return undefined;
    }
  }

  return undefined;
}

async function createIssue(
  draft: IssueDraft,
  repository: GitHubRepository,
  token: string | undefined,
  apiBaseUrl: string
): Promise<CreatedIssue> {
  if (!token) {
    return createIssueWithGh(draft, repository);
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/repos/${repository.owner}/${repository.name}/issues`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({
      title: draft.title,
      body: draft.body,
      labels: draft.labels
    })
  });

  return parseIssueResponse(response, "creation");
}

async function patchIssue(
  issueNumber: number,
  draft: IssueDraft,
  repository: GitHubRepository,
  token: string | undefined,
  apiBaseUrl: string
): Promise<CreatedIssue> {
  if (!token) {
    return patchIssueWithGh(issueNumber, draft, repository);
  }

  const response = await fetch(
    `${apiBaseUrl.replace(/\/$/, "")}/repos/${repository.owner}/${repository.name}/issues/${issueNumber}`,
    {
      method: "PATCH",
      headers: buildHeaders(token),
      body: JSON.stringify({
        title: draft.title,
        body: draft.body,
        labels: draft.labels
      })
    }
  );

  return parseIssueResponse(response, "update");
}

async function findOpenIssueByExactTitleWithGh(
  title: string,
  repository: GitHubRepository
): Promise<CreatedIssue | undefined> {
  for (let page = 1; page <= 10; page += 1) {
    const payload = await ghApi(
      [`repos/${repository.owner}/${repository.name}/issues?state=open&per_page=100&page=${page}`],
      `Lists open issues page ${page}`
    );

    if (!Array.isArray(payload)) {
      throw new Error("gh issue lookup returned an unexpected response payload.");
    }

    const matchedIssue = payload.find(
      (issue) =>
        issue &&
        typeof issue === "object" &&
        !("pull_request" in issue) &&
        issue.title === title &&
        "number" in issue &&
        "html_url" in issue
    );

    if (matchedIssue) {
      return {
        number: Number(matchedIssue.number),
        url: String(matchedIssue.html_url)
      };
    }

    if (payload.length < 100) {
      return undefined;
    }
  }

  return undefined;
}

async function createIssueWithGh(draft: IssueDraft, repository: GitHubRepository): Promise<CreatedIssue> {
  const payload = await ghApi(
    [
      `repos/${repository.owner}/${repository.name}/issues`,
      "--method",
      "POST",
      "-f",
      `title=${draft.title}`,
      "-f",
      `body=${draft.body}`,
      ...draft.labels.flatMap((label) => ["-f", `labels[]=${label}`])
    ],
    "Creates GitHub issue with gh"
  );

  return parseGhIssuePayload(payload, "creation");
}

async function patchIssueWithGh(issueNumber: number, draft: IssueDraft, repository: GitHubRepository): Promise<CreatedIssue> {
  const payload = await ghApi(
    [
      `repos/${repository.owner}/${repository.name}/issues/${issueNumber}`,
      "--method",
      "PATCH",
      "-f",
      `title=${draft.title}`,
      "-f",
      `body=${draft.body}`,
      ...draft.labels.flatMap((label) => ["-f", `labels[]=${label}`])
    ],
    "Updates GitHub issue with gh"
  );

  return parseGhIssuePayload(payload, "update");
}

async function ghApi(args: string[], description: string): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync("gh", ["api", ...args], {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 4 * 1024 * 1024
    });

    return JSON.parse(stdout);
  } catch (error) {
    const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? String((error as { stderr?: unknown }).stderr) : "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${description} failed: ${stderr.trim() || message}`);
  }
}

function parseGhIssuePayload(payload: unknown, action: "creation" | "update"): CreatedIssue {
  if (!payload || typeof payload !== "object" || !("number" in payload) || !("html_url" in payload)) {
    throw new Error(`gh issue ${action} returned an unexpected response payload.`);
  }

  return {
    number: Number(payload.number),
    url: String(payload.html_url)
  };
}

function buildHeaders(token: string): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28"
  };
}

async function parseIssueResponse(response: Response, action: "creation" | "update"): Promise<CreatedIssue> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload ? String(payload.message) : response.statusText;
    throw new Error(`GitHub issue ${action} failed with ${response.status}: ${message}`);
  }

  if (!payload || typeof payload !== "object" || !("number" in payload) || !("html_url" in payload)) {
    throw new Error(`GitHub issue ${action} returned an unexpected response payload.`);
  }

  return {
    number: Number(payload.number),
    url: String(payload.html_url)
  };
}
