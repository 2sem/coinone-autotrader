import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const workflowScripts = {
  "trade-run": {
    label: "트레이드 실행",
    npmScript: "trade:once"
  },
  "agent-trade-run": {
    label: "에이전트 드라이런 실행",
    npmScript: "agent:decision"
  },
  "daily-report": {
    label: "일간 보고서",
    npmScript: "report:daily"
  },
  "monthly-report": {
    label: "월간 보고서",
    npmScript: "report:monthly"
  }
};

async function main() {
  const workflowKind = process.argv[2] ?? "trade-run";
  const workflowConfig = workflowScripts[workflowKind];

  if (!workflowConfig) {
    throw new Error(`Unsupported workflow kind: ${workflowKind}`);
  }

  const reportDir = path.resolve("artifacts", workflowKind);
  const startedAt = new Date().toISOString();
  await mkdir(reportDir, { recursive: true });

  const resultPath = path.join(reportDir, "result.json");
  const summaryPath = path.join(reportDir, "summary.md");
  const statusPath = path.join(reportDir, "status.json");

  const execution = await runScript(workflowConfig.npmScript);
  const report = await buildReport(workflowKind, workflowConfig.label, startedAt, reportDir, execution);

  await writeFile(resultPath, `${JSON.stringify(report.rawResult, null, 2)}\n`, "utf8");
  await writeFile(summaryPath, `${report.summary}\n`, "utf8");
  await writeFile(statusPath, `${JSON.stringify(report.status, null, 2)}\n`, "utf8");

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendStepSummary(process.env.GITHUB_STEP_SUMMARY, report.summary);
  }

  await setOutputs({
    conclusion: report.status.conclusion,
    needs_attention: String(report.status.needsAttention),
    issue_title: report.status.issueTitle,
    report_dir: reportDir,
    result_path: resultPath,
    summary_path: summaryPath,
    status_path: statusPath
  });
}

async function runScript(npmScript) {
  try {
    const { stdout, stderr } = await execFileAsync(npmCommand, ["run", "--silent", npmScript], {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 4 * 1024 * 1024
    });

    return {
      ok: true,
      stdout,
      stderr
    };
  } catch (error) {
    return {
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
      stderr: typeof error.stderr === "string" ? error.stderr : "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function buildReport(workflowKind, workflowLabel, startedAt, reportDir, execution) {
  if (!execution.ok) {
    const rawResult = {
      error: execution.error,
      stdout: execution.stdout,
      stderr: execution.stderr
    };

    return {
      rawResult,
      summary: buildFailureSummary(workflowLabel, startedAt, execution.error, execution.stderr),
      status: {
        conclusion: "failure",
        needsAttention: true,
        issueTitle: `[${workflowLabel}] failure - ${startedAt.slice(0, 10)}`
      }
    };
  }

  const rawResult = parseJson(execution.stdout);

  if (!rawResult.ok) {
    return {
      rawResult: {
        error: rawResult.error,
        stdout: execution.stdout
      },
      summary: buildFailureSummary(workflowLabel, startedAt, rawResult.error, execution.stdout),
      status: {
        conclusion: "failure",
        needsAttention: true,
        issueTitle: `[${workflowLabel}] invalid output - ${startedAt.slice(0, 10)}`
      }
    };
  }

  const output = rawResult.value;
  const tradeRun = output && typeof output === "object" && "tradeRun" in output ? output.tradeRun : output;
  const agentDecision = getAgentDecisionResult(output);
  const reasons = collectAttentionReasons(output, tradeRun);
  const conclusion = reasons.length > 0 ? "action-needed" : "success";

  await copyWorkflowArtifacts(output, reportDir, agentDecision);

  return {
    rawResult: output,
    summary: buildSuccessSummary({ workflowKind, workflowLabel, startedAt, output, tradeRun, agentDecision, reasons, conclusion }),
    status: {
      conclusion,
      needsAttention: reasons.length > 0,
      issueTitle: `[${workflowLabel}] ${conclusion} - ${startedAt.slice(0, 10)}`
    }
  };
}

function parseJson(value) {
  const candidates = [value.trim()];
  const firstJsonLineIndex = value.search(/^\s*\{/m);

  if (firstJsonLineIndex > 0) {
    candidates.push(value.slice(firstJsonLineIndex).trim());
  }

  for (const candidate of candidates.filter(Boolean)) {
    try {
      return {
        ok: true,
        value: JSON.parse(candidate)
      };
    } catch {
      continue;
    }
  }

  return {
    ok: false,
    error: "Command output did not contain parseable JSON."
  };
}

function collectAttentionReasons(output, tradeRun) {
  const reasons = [];
  const agentDecision = getAgentDecisionResult(output);

  if (agentDecision) {
    if (agentDecision.dryRun !== true) {
      reasons.push("에이전트 드라이런 모드가 활성화되어 있지 않습니다.");
    }

    if (agentDecision.execution?.executionPlan?.executionBlocked !== true) {
      reasons.push("에이전트 실행 계획이 차단 상태가 아닙니다.");
    }

    if (!agentDecision.output?.decisionLatestPath || !agentDecision.output?.executionLatestPath) {
      reasons.push("에이전트 판단 또는 실행 산출물 경로가 누락되었습니다.");
    }
  }

  if (!tradeRun || tradeRun.dryRun !== true) {
    reasons.push("드라이런 모드가 활성화되어 있지 않습니다.");
  }

  if (!agentDecision && (!Array.isArray(tradeRun?.selectedTargets) || tradeRun.selectedTargets.length === 0)) {
    reasons.push("선택된 대상이 생성되지 않았습니다.");
  }

  if (!agentDecision && tradeRun?.marketDataSource === "mock" && tradeRun?.marketDataMode !== "mock") {
    reasons.push("실행 중 모의 마켓 데이터로 폴백되었습니다.");
  }

  if (output && typeof output === "object" && output.actionNeeded?.required === true) {
    reasons.push(...(output.actionNeeded.reasons ?? []));
  }

  return Array.from(new Set(reasons));
}

function buildFailureSummary(workflowLabel, startedAt, errorMessage, details) {
  return [
    `# ${workflowLabel}`,
    "",
    "- 상태: 실패",
    `- 시작 시각: ${startedAt}`,
    `- 오류: ${errorMessage}`,
    details && String(details).trim() ? "" : "",
    details && String(details).trim() ? "## 상세" : "",
    details && String(details).trim() ? "```text" : "",
    details && String(details).trim() ? String(details).trim().slice(0, 3000) : "",
    details && String(details).trim() ? "```" : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSuccessSummary({ workflowKind, workflowLabel, startedAt, output, tradeRun, agentDecision, reasons, conclusion }) {
  const selectedTargets = Array.isArray(tradeRun?.selectedTargets) && tradeRun.selectedTargets.length > 0
    ? tradeRun.selectedTargets.join(", ")
    : Array.isArray(agentDecision?.snapshot?.selectedTargets) && agentDecision.snapshot.selectedTargets.length > 0
      ? agentDecision.snapshot.selectedTargets.join(", ")
      : "없음";
  const dryRun = tradeRun?.dryRun ?? agentDecision?.dryRun ?? false;
  const marketDataMode = tradeRun?.marketDataMode ?? agentDecision?.snapshot?.source ?? "unknown";
  const marketDataSource = tradeRun?.marketDataSource ?? agentDecision?.snapshot?.source ?? "unknown";
  const selectionMode = tradeRun?.selectionMode ?? agentDecision?.snapshot?.selectionMode ?? "unknown";
  const availableMarketCount = tradeRun?.availableMarketCount ?? agentDecision?.snapshot?.availableMarketCount ?? 0;
  const localizedWorkflowKind = localizeWorkflowKind(workflowKind);
  const localizedConclusion = conclusion === "success"
    ? "성공"
    : conclusion === "action-needed"
      ? "확인 필요"
      : conclusion;
  const lines = [
    `# ${workflowLabel}`,
    "",
    `- 상태: ${localizedConclusion}`,
    `- 시작 시각: ${startedAt}`,
    `- 워크플로 종류: ${localizedWorkflowKind}`,
    `- 드라이런: ${String(dryRun)}`,
    `- 마켓 데이터 모드/소스: ${localizeMode(String(marketDataMode))} / ${localizeSource(String(marketDataSource))}`,
    `- 선택 모드: ${localizeSelectionMode(String(selectionMode))}`,
    `- 선택된 대상: ${selectedTargets}`,
    `- 사용 가능 마켓 수: ${String(availableMarketCount)}`,
    output?.markdownPath ? `- 마크다운 출력: ${String(output.markdownPath)}` : null,
    output?.github ? `- GitHub 이슈 생성 여부: ${String(Boolean(output.github.created))}` : null,
    output?.github ? `- GitHub 이슈 업데이트 여부: ${String(Boolean(output.github.updated))}` : null,
    output?.github?.issueUrl ? `- GitHub 이슈 URL: ${String(output.github.issueUrl)}` : null,
    output?.slack ? `- Slack 전송 여부: ${String(Boolean(output.slack.delivered))}` : null
  ].filter(Boolean);

  if (agentDecision) {
    lines.push(
      "",
      "## 에이전트 판단",
      `- 제공자: ${localizeAgentProvider(String(agentDecision.provider ?? agentDecision.decision?.provider ?? "unknown"))}`,
      `- 판단: ${String(agentDecision.decision?.userFacing?.headline ?? "없음")}`,
      `- 요약: ${String(agentDecision.decision?.userFacing?.summary ?? "없음")}`,
      `- 실행 기록: ${String(agentDecision.execution?.status ?? "unknown")}`,
      `- 실행 차단: ${String(agentDecision.execution?.executionPlan?.executionBlocked ?? false)}`,
      `- 스냅샷 산출물: ${String(agentDecision.output?.snapshotLatestPath ?? "없음")}`,
      `- 판단 산출물: ${String(agentDecision.output?.decisionLatestPath ?? "없음")}`,
      `- 실행 산출물: ${String(agentDecision.output?.executionLatestPath ?? "없음")}`,
      `- 상태 산출물: ${String(agentDecision.output?.stateLatestPath ?? "없음")}`
    );

    if (Array.isArray(agentDecision.decision?.userFacing?.riskNotes) && agentDecision.decision.userFacing.riskNotes.length > 0) {
      lines.push("", "## 에이전트 리스크 요약", ...agentDecision.decision.userFacing.riskNotes.map((note) => `- ${note}`));
    }

    if (Array.isArray(agentDecision.execution?.executionPlan?.blockReasons) && agentDecision.execution.executionPlan.blockReasons.length > 0) {
      lines.push("", "## 에이전트 실행 차단 사유", ...agentDecision.execution.executionPlan.blockReasons.map((reason) => `- ${reason}`));
    }
  }

  if (reasons.length > 0) {
    lines.push("", "## 확인 필요", ...reasons.map((reason) => `- ${reason}`));
  }

  return lines.join("\n");
}

function localizeWorkflowKind(value) {
  if (value === "trade-run") {
    return "트레이드 실행";
  }

  if (value === "agent-trade-run") {
    return "에이전트 드라이런 실행";
  }

  if (value === "daily-report") {
    return "일간 보고서";
  }

  if (value === "monthly-report") {
    return "월간 보고서";
  }

  return value;
}

function localizeMode(value) {
  if (value === "mock") {
    return "모의 데이터";
  }

  if (value === "live") {
    return "실데이터";
  }

  if (value === "auto") {
    return "자동";
  }

  return value;
}

function localizeSource(value) {
  if (value === "mock") {
    return "모의 데이터";
  }

  if (value === "live-cli") {
    return "CLI 실데이터";
  }

  return value;
}

function localizeSelectionMode(value) {
  if (value === "allowlist") {
    return "허용 목록";
  }

  if (value === "auto") {
    return "자동 선택";
  }

  return value;
}

function localizeAgentProvider(value) {
  if (value === "openai-compatible") {
    return "OpenAI 호환";
  }

  return value;
}

function getAgentDecisionResult(output) {
  if (!output || typeof output !== "object") {
    return null;
  }

  if ("decision" in output && "execution" in output && "snapshot" in output) {
    return output;
  }

  if ("agentDecision" in output && output.agentDecision && typeof output.agentDecision === "object") {
    return output.agentDecision;
  }

  return null;
}

async function copyWorkflowArtifacts(output, reportDir, agentDecision) {
  const referencedPaths = [];

  if (output && typeof output === "object" && typeof output.markdownPath === "string") {
    referencedPaths.push({
      sourcePath: String(output.markdownPath),
      targetName: path.basename(String(output.markdownPath))
    });
  }

  if (agentDecision?.output) {
    referencedPaths.push(
      { sourcePath: String(agentDecision.output.snapshotLatestPath ?? ""), targetName: "agent-snapshot-latest.json" },
      { sourcePath: String(agentDecision.output.decisionLatestPath ?? ""), targetName: "agent-decision-latest.json" },
      { sourcePath: String(agentDecision.output.executionLatestPath ?? ""), targetName: "agent-execution-latest.json" },
      { sourcePath: String(agentDecision.output.stateLatestPath ?? ""), targetName: "agent-state-latest.json" }
    );
  }

  await Promise.all(
    referencedPaths.map(async ({ sourcePath, targetName }) => {
      if (!sourcePath) {
        return;
      }

      const absoluteSourcePath = path.resolve(sourcePath);
      const targetPath = path.join(reportDir, targetName);
      await copyFile(absoluteSourcePath, targetPath).catch(() => undefined);
    })
  );
}

async function appendStepSummary(filePath, summary) {
  const existing = await readFile(filePath, "utf8").catch(() => "");
  const nextValue = existing ? `${existing.trimEnd()}\n\n${summary}\n` : `${summary}\n`;
  await writeFile(filePath, nextValue, "utf8");
}

async function setOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  const serialized = Object.entries(outputs)
    .map(([key, value]) => `${key}=${escapeOutput(String(value ?? ""))}`)
    .join("\n");

  await writeFile(process.env.GITHUB_OUTPUT, `${serialized}\n`, {
    encoding: "utf8",
    flag: "a"
  });
}

function escapeOutput(value) {
  return value.replace(/%/g, "%25").replace(/\n/g, "%0A").replace(/\r/g, "%0D");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
