# coinone-autotrader

Phase 5 adds an execution-preview layer alongside the existing dry-run trading scaffold. It keeps live trading disabled, preserves the current `trade:once`, `agent:decision`, and reporting flows, and now turns real `trade:once` decisions plus live or mock Coinone data into persisted would-submit order previews with final validation results while never sending a live order. It also adds manual approval plus mock submit scaffolding so operators can approve a specific `previewId`, attempt a guarded submit, and persist approval/submit audit artifacts without calling the live order API.

The main executable workflow remains the dry-run `trade:once` command for the current deterministic strategy engine. In parallel, `agent:decision` now builds a normalized Coinone market/account snapshot from the existing CLI-backed data layer, validates a richer buy/sell/hold decision payload, persists snapshot/decision/execution/state files under `artifacts/agent-decision`, and supports either the existing deterministic mock provider or an OpenAI-compatible model endpoint through built-in `fetch`. Reporting commands continue to reuse the dry-run snapshot, build markdown issue drafts with a vertical Mermaid workflow diagram, optionally create GitHub issues through the REST API, and notify Slack through an incoming webhook. Phase 4 keeps internal reasoning, risk, and provider metadata in English while exposing Korean user-facing summaries for CLI/reporting/Slack; report titles stay stable for exact-title dedupe.

## Safety defaults

- Dry run is enabled by default with `DRY_RUN=true`.
- `.env` files are ignored by git so secrets stay local.
- Live order placement is still not implemented.
- `agent:decision` persists inspectable JSON artifacts only; it never places orders.
- Dry-run execution artifacts record what would have been sent for execution, but they are always blocked from live submission.
- `execution:preview` builds would-submit order payloads and final validation results, then persists them without calling any order API.
- `execution:approve` binds a short-lived manual approval to exactly one `previewId` and persists it for audit.
- `execution:submit` fails closed unless preview, approval, and final safety gates all pass; the current adapter is mock-only and never sends a live order.
- Coinone 계좌 정보는 판단에 항상 포함되며, 읽지 못하면 보수적으로 `hold` 처리합니다.
- Missing or uncertain account data now resolves to `hold` instead of guessing.
- Daily risk caps are enforced only from completed orders and default to `hold` when account history is unavailable.
- `USDC` and `USDT` automatically use the `stablecoin` profile unless `STRATEGY_PROFILE_OVERRIDES` says otherwise.
- GitHub issue creation uses built-in `fetch`; no extra HTTP client is added.

## Requirements

- Node.js 20+
- npm

## Setup

```bash
cp .env.example .env
npm install
npm run coinone:install
npm run coinone:doctor
```

`npm run coinone:install` clones `2sem/coinone-api-cli` into `.vendor/coinone-api-cli`, checks out pinned commit `e393f970ceff3c0af5bc03c4153b03458485b689` (`1.0.2`), installs its dependencies, and builds the local CLI entrypoint used by this project.

This explicit installation contract is used instead of an npm/git package dependency because the upstream repository currently does not publish build artifacts in a directly consumable package form.

`npm run coinone:doctor` runs the pinned vendored CLI health check locally, loads values from the repo `.env`, and confirms whether private auth env vars are configured without placing orders.

## Run once

```bash
npm run trade:once
npm run agent:decision
npm run execution:preview
npm run execution:approve
npm run execution:submit
```

Dry-run behavior:

- `MARKET_DATA_MODE=auto`: try the local `coinone` CLI first, then fall back to mock data.
- `MARKET_DATA_MODE=live`: require the local CLI and fail if it cannot return data.
- `MARKET_DATA_MODE=mock`: skip all external API reads and use deterministic local fixtures.
- Coinone credentials가 설정되어 있으면 balances와 최근 30일 completed orders를 항상 함께 읽어 판단에 반영합니다.
- Decision output stays conservative: cooldown blocks repeat trades, completed orders enforce `MAX_DAILY_BUY_KRW` and `MAX_TRADES_PER_DAY`, stablecoins accumulate with smaller capped buys and no sell signal, missing balance or pricing data yields `hold`, and live order placement stays disabled.

## Execution Preview

```bash
MARKET_DATA_MODE=auto npm run execution:preview
MARKET_DATA_MODE=live npm run execution:preview
```

Behavior:

- Reuses the existing `trade:once` market snapshot and deterministic decision engine instead of inventing a separate strategy path.
- Converts each non-hold decision into a realistic would-submit limit-order payload with `side`, `type`, `price`, `quantity`, `value`, and `pair`.
- Runs final validation gates for payload completeness, allowlist membership, `MAX_ORDER_KRW`, `MIN_CASH_RESERVE_KRW`, `ENABLE_LIVE_TRADING`, `TRADING_KILL_SWITCH`, and `DRY_RUN` policy.
- Persists `previews/latest.json` plus dated copies under `EXECUTION_PREVIEW_OUTPUT_DIR`.
- Routine preview Slack delivery is silent by default; set `SLACK_NOTIFY_ROUTINE_PREVIEW=true` only if you want every preview run to page Slack.
- Keeps Korean CLI summaries for operators while validation gate details remain English for debugging.
- Never sends a live order, even if `ENABLE_LIVE_TRADING=true` and `DRY_RUN=false` are set locally.

## Approval And Submit Scaffold

```bash
MARKET_DATA_MODE=mock npm run execution:preview
MARKET_DATA_MODE=mock npm run execution:approve
MARKET_DATA_MODE=mock npm run execution:submit

MARKET_DATA_MODE=mock npm run execution:approve -- --preview-id=execution-preview-2026-04-04T00-00-00-000Z
MARKET_DATA_MODE=mock npm run execution:submit -- --preview-id=execution-preview-2026-04-04T00-00-00-000Z --approval-id=execution-approval-2026-04-04T00-01-00-000Z
```

Behavior:

- `execution:approve` loads the latest preview by default, or a specific preview via `--preview-id=...`.
- Approval artifacts are written to `approvals/latest.json` plus dated copies under `EXECUTION_PREVIEW_OUTPUT_DIR`.
- Each approval expires after `EXECUTION_APPROVAL_WINDOW_SECONDS` and is bound to exactly one `previewId`.
- `execution:submit` validates preview schema, approval presence, preview/approval ID match, approval expiry, and whether the preview contains at least one submittable entry.
- Submit attempts fail closed when approval is missing, expired, or linked to another preview.
- Submit artifacts are written to `submits/latest.json` plus dated copies even when the submit is blocked.
- The current submit adapter is intentionally `mock` only, so successful submit runs record mock order IDs and never place a real Coinone order.

## Agent Decision Dry Run

```bash
MARKET_DATA_MODE=mock npm run agent:decision
MARKET_DATA_MODE=mock npm run report:agent-trade-run
```

Behavior:

- Reuses the existing Coinone CLI-backed snapshot loader and selection logic.
- Normalizes the selected market/account view into a versioned snapshot contract.
- Validates both the snapshot contract and the returned decision contract.
- Validates the decision again before generating any execution artifact.
- Persists `snapshots/latest.json`, `decisions/latest.json`, `executions/latest.json`, and `state/latest.json` plus dated copies under `AGENT_DECISION_OUTPUT_DIR`.
- Uses `AGENT_DECISION_PROVIDER=mock` by default for local runs; `openai-compatible` sends a strict JSON request to `AGENT_PROVIDER_ENDPOINT` with built-in `fetch` only.
- Keeps the internal prompt and reasoning contract in English, while deriving Korean `userFacing` fields locally for CLI/reporting output.
- If the OpenAI-compatible provider is selected without `AGENT_PROVIDER_ENDPOINT`, `AGENT_PROVIDER_API_KEY`, or `AGENT_PROVIDER_MODEL`, the run fails closed before any execution artifact is written unless `AGENT_PROVIDER_FALLBACK_TO_MOCK=true` is explicitly set.
- If the OpenAI-compatible call fails, returns invalid JSON, or fails contract normalization, the run either falls back to the mock provider when `AGENT_PROVIDER_FALLBACK_TO_MOCK=true` or fails safely without placing orders.
- Returns `buy`/`sell`/`hold` schema support with richer fields such as confidence score, risk notes, state updates, and provider metadata; execution remains dry-run-only even for model-backed decisions.
- CLI output now prints a short decision/execution summary before the full JSON payload.
- `report:agent-trade-run` keeps the existing deterministic `report:trade-run` path unchanged and writes a separate workflow bundle under `artifacts/agent-trade-run/` with Korean summary text plus copied `agent-snapshot-latest.json`, `agent-decision-latest.json`, `agent-execution-latest.json`, and `agent-state-latest.json` files.

## Generate reports

```bash
npm run report:daily
npm run report:monthly
```

Reporting behavior:

- Each run writes a markdown draft into `REPORT_OUTPUT_DIR`.
- Daily and monthly report bodies and related Slack report notifications are written in Korean by default.
- If `GITHUB_REPOSITORY` and `GITHUB_CREATE_ISSUES=true` are set, the app creates or updates the issue.
- Local runs prefer the authenticated `gh` CLI session for issue creation and updates.
- GitHub Actions can continue using the built-in `github.token` environment when available.
- If issue creation is skipped or blocked, the command still returns a markdown path and manual GitHub issue URL metadata when a repository is configured.
- If `SLACK_WEBHOOK_URL` is set, Slack delivery now follows the notification policy: routine preview and routine dry-run events are silent by default, while daily/monthly reports plus action-needed or blocked events stay eligible.

## GitHub Actions workflows

The repo includes four GitHub Actions workflows under `.github/workflows`:

- `trade-run.yml`: scheduled or manual dry-run execution with artifact upload, Slack alerting, and optional action-needed issue creation.
- `agent-trade-run.yml`: manual agent-driven dry-run execution with artifact upload, Korean workflow summary, copied agent artifacts, Slack alerting, and optional action-needed issue creation.
- `daily-report.yml`: scheduled or manual daily report generation using the existing report flow.
- `monthly-report.yml`: scheduled or manual monthly report generation using the existing report flow.

Workflow defaults stay safe:

- Node 20 is used in every workflow.
- `DRY_RUN=true` is forced in CI.
- `MARKET_DATA_MODE=mock` is the default for both schedules and manual dispatches.
- Coinone 계좌 정보 조회는 워크플로에서도 항상 포함됩니다.
- Each workflow has a concurrency guard so overlapping runs on the same ref do not execute in parallel.

Schedule defaults are KST-friendly and documented in UTC for GitHub Actions cron syntax:

- `trade-run.yml`: every day at `09:00` and `18:00` KST (`00:00` and `09:00` UTC).
- `daily-report.yml`: every day at `09:05` KST (`00:05` UTC).
- `monthly-report.yml`: first day of the month at `09:10` KST (`00:10` UTC).

### Workflow dispatch inputs

`trade-run.yml`, `daily-report.yml`, and `monthly-report.yml` expose the same safe manual inputs:

| Input | Purpose | Default |
| --- | --- | --- |
| `market_data_mode` | `mock`, `auto`, or `live` | `mock` |
| `selection_mode` | `allowlist` or `auto` | `allowlist` |
| `trade_targets` | Comma-separated targets for allowlist mode | `BTC,ETH` |
| `auto_selection_universe` | Comma-separated targets for auto mode | `BTC,ETH,XRP,SOL` |
| `excluded_targets` | Comma-separated exclusions | empty |
| `max_selected_assets` | Max assets to keep in auto mode | `5` |
| `create_github_issue` | Enables report or action-needed GitHub issue creation | `false` |

`agent-trade-run.yml` exposes the same dry-run market-selection inputs plus one additional manual input:

| Input | Purpose | Default |
| --- | --- | --- |
| `agent_decision_provider` | `mock` or `openai-compatible` | `mock` |

### GitHub Actions vars and secrets contract

Optional repository variables:

- `COINONE_MARKET_DATA_MODE`
- `COINONE_SELECTION_MODE`
- `COINONE_TRADE_TARGETS`
- `COINONE_AUTO_SELECTION_UNIVERSE`
- `COINONE_EXCLUDED_TARGETS`
- `COINONE_MAX_SELECTED_ASSETS`
- `ENABLE_LIVE_TRADING`
- `TRADING_KILL_SWITCH`
- `COINONE_CLI_TIMEOUT_MS`
- `COINONE_CLI_BASE_URL`
- `CREATE_GITHUB_ISSUE`
- `ACTIONS_ISSUE_LABELS`
- `MAX_OPEN_POSITIONS`
- `MAX_PORTFOLIO_EXPOSURE_PCT`
- `AGENT_DECISION_PROVIDER`
- `AGENT_PROVIDER_ENDPOINT`
- `AGENT_PROVIDER_MODEL`
- `AGENT_PROVIDER_PROMPT_VERSION`
- `AGENT_PROVIDER_TEMPERATURE`
- `AGENT_PROVIDER_TIMEOUT_MS`
- `AGENT_PROVIDER_FALLBACK_TO_MOCK`

Optional repository secrets:

- `COINONE_ACCESS_TOKEN`
- `COINONE_SECRET_KEY`
- `AGENT_PROVIDER_API_KEY`
- `SLACK_WEBHOOK_URL`

For the OpenAI-compatible agent path in GitHub Actions, keep the endpoint/model/prompt settings in repository variables and store only `AGENT_PROVIDER_API_KEY` as a secret. If those values are missing while `agent_decision_provider=openai-compatible`, the run fails closed before execution artifacts are written unless `AGENT_PROVIDER_FALLBACK_TO_MOCK=true` is configured.

The daily and monthly workflows also pass the built-in GitHub Actions `github.token` to the app as `GITHUB_TOKEN` and use `github.repository` as `GITHUB_REPOSITORY`, so no extra GitHub secret is required for same-repo issue creation. Local runs can rely on `gh auth login` instead.

All workflows now pass the live-safety gates and portfolio caps into the runtime. Keep `ENABLE_LIVE_TRADING=false` for normal operation, and flip `TRADING_KILL_SWITCH=true` if you want an explicit emergency stop recorded in dry-run/report output.

When issue creation is enabled, daily and monthly runs search open issues in the configured repo by the exact report title for that period. If a matching issue is already open, the run updates that issue in place; otherwise it creates a new one. Slack notifications still include the issue link in either case.

The trade-run workflow now applies the same exact-title open-issue dedupe behavior for action-needed issues: it updates the matching open issue when found and only creates a new issue when no exact title match exists. Slack action-needed notifications are preserved.

Each workflow uploads an `artifacts/<workflow-name>/` bundle containing raw JSON output, a Markdown summary, and machine-readable status metadata. Runs that fail or need follow-up are surfaced in the workflow summary, can notify Slack when `SLACK_WEBHOOK_URL` is configured, and can open GitHub issues when issue creation is enabled.

The agent workflow bundle additionally includes copied latest agent snapshot/decision/execution/state JSON files so the uploaded artifact contains both the high-level summary and the inspectable dry-run decision records.

## Build

```bash
npm run build
npm run coinone:doctor
```

## Configuration

The app loads environment variables from `.env` and process environment.

| Variable | Purpose | Default |
| --- | --- | --- |
| `DRY_RUN` | Keeps execution in simulation mode | `true` |
| `ENABLE_LIVE_TRADING` | Future live execution gate; keep `false` until a guarded live adapter exists | `false` |
| `TRADING_KILL_SWITCH` | Emergency stop for any future live execution path | `false` |
| `QUOTE_CURRENCY` | Quote currency used for markets | `KRW` |
| `MARKET_DATA_MODE` | `auto`, `live`, or `mock` market-data source | `auto` |
| `COINONE_CLI_PATH` | Optional path to `coinone` executable or built JS entrypoint | auto-detect `.vendor/...` then `coinone` |
| `COINONE_CLI_TIMEOUT_MS` | Timeout for each local CLI invocation | `15000` |
| `COINONE_CLI_BASE_URL` | Optional Coinone-compatible base URL for mocks/proxies | empty |
| `SELECTION_MODE` | Asset selection strategy: `allowlist` or `auto` | `allowlist` |
| `RISK_PROFILE` | High-level risk mode: `conservative`, `balanced`, or `aggressive` | `balanced` |
| `TRADE_TARGETS` | Comma-separated assets used in `allowlist` mode | empty |
| `AUTO_SELECTION_UNIVERSE` | Comma-separated candidate assets for `auto` mode | empty |
| `MAX_SELECTED_ASSETS` | Maximum assets selected in `auto` mode | `5` |
| `EXCLUDED_TARGETS` | Comma-separated assets to always exclude | empty |
| `DEFAULT_STRATEGY_PROFILE` | Fallback strategy profile for non-overridden assets: `default` or `stablecoin` | `default` |
| `STABLECOIN_TARGETS` | Assets that automatically use the `stablecoin` profile unless overridden | `USDC,USDT` |
| `STRATEGY_PROFILE_OVERRIDES` | Comma-separated `TARGET:PROFILE` mappings such as `USDT:default` | empty |
| `MAX_ORDER_KRW` | Optional override for one recommended buy order value cap | derived from `RISK_PROFILE` |
| `MAX_POSITION_PER_ASSET_KRW` | Optional override for one asset's KRW exposure cap | derived from `RISK_PROFILE` |
| `MAX_DAILY_BUY_KRW` | Optional override for total completed buy value cap per UTC day | derived from `RISK_PROFILE` |
| `MAX_TRADES_PER_DAY` | Optional override for total completed trades per UTC day | derived from `RISK_PROFILE` |
| `MAX_OPEN_POSITIONS` | Optional override for simultaneously held positions | derived from `RISK_PROFILE` |
| `MAX_PORTFOLIO_EXPOSURE_PCT` | Optional override for portfolio exposure cap | derived from `RISK_PROFILE` |
| `MIN_CASH_RESERVE_KRW` | Optional override for KRW cash reserve | derived from `RISK_PROFILE` |
| `COOLDOWN_MINUTES` | Optional override for per-target cooldown | derived from `RISK_PROFILE` |
| `BUY_FRACTION_OF_CASH` | Optional override for buy sizing fraction | derived from `RISK_PROFILE` |
| `SELL_FRACTION_OF_POSITION` | Optional override for sell sizing fraction | derived from `RISK_PROFILE` |
| `AGENT_DECISION_PROVIDER` | Agent provider implementation used by `agent:decision`: `mock` or `openai-compatible` | `mock` |
| `AGENT_DECISION_OUTPUT_DIR` | Output directory for normalized snapshot, decision, and state files | `artifacts/agent-decision` |
| `EXECUTION_PREVIEW_OUTPUT_DIR` | Output directory for persisted execution-preview artifacts | `artifacts/execution-preview` |
| `EXECUTION_APPROVAL_WINDOW_SECONDS` | Manual approval validity window before `execution:submit` must reject it | `300` |
| `AGENT_PROVIDER_ENDPOINT` | Full OpenAI-compatible chat completions endpoint used when `AGENT_DECISION_PROVIDER=openai-compatible` | empty |
| `AGENT_PROVIDER_API_KEY` | Bearer token for the OpenAI-compatible endpoint | empty |
| `AGENT_PROVIDER_MODEL` | Provider model identifier sent to the OpenAI-compatible endpoint and recorded into decision metadata | empty |
| `AGENT_PROVIDER_PROMPT_VERSION` | Prompt contract version recorded into provider metadata | `phase-4` |
| `AGENT_PROVIDER_TEMPERATURE` | Optional provider temperature sent to the endpoint and recorded into decision metadata | empty |
| `AGENT_PROVIDER_TIMEOUT_MS` | Timeout for the OpenAI-compatible provider request | `20000` |
| `AGENT_PROVIDER_FALLBACK_TO_MOCK` | If `true`, automatically re-runs `agent:decision` with the deterministic mock provider when the OpenAI-compatible path is misconfigured or fails | `false` |
| `COINONE_ACCESS_TOKEN` | Coinone private API access token used for account-based 판단과 리포트 | empty |
| `COINONE_SECRET_KEY` | Coinone private API secret key used for account-based 판단과 리포트 | empty |
| `SLACK_WEBHOOK_URL` | Incoming webhook for issue-link or action-needed notifications | empty |
| `SLACK_NOTIFY_ROUTINE_PREVIEW` | Enables Slack for routine execution preview runs | `false` |
| `SLACK_NOTIFY_ROUTINE_DRY_RUN` | Enables Slack for routine dry-run trade or agent runs | `false` |
| `SLACK_NOTIFY_APPROVAL_NEEDED` | Keeps approval-needed notifications eligible for Slack | `true` |
| `SLACK_NOTIFY_ACTION_NEEDED` | Keeps blocked or action-needed notifications eligible for Slack | `true` |
| `SLACK_NOTIFY_DAILY_REPORT` | Keeps daily report notifications eligible for Slack | `true` |
| `SLACK_NOTIFY_MONTHLY_REPORT` | Keeps monthly report notifications eligible for Slack | `true` |
| `SLACK_NOTIFY_LIVE_SUBMIT` | Reserves Slack eligibility for future live submit notifications | `true` |
| `GITHUB_REPOSITORY` | Repository for issue creation in `owner/repo` form | empty |
| `GITHUB_TOKEN` | Optional GitHub token for REST API issue creation; local runs can use `gh auth login` instead | empty |
| `GITHUB_API_BASE_URL` | GitHub REST API base URL | `https://api.github.com` |
| `GITHUB_CREATE_ISSUES` | Enables live GitHub issue creation for report runs | `false` |
| `REPORT_OUTPUT_DIR` | Directory where markdown issue drafts are written | `reports/generated` |

## Selection behavior

- `allowlist`: selects `TRADE_TARGETS`, removes `EXCLUDED_TARGETS`, and drops markets missing from the fetched market list.
- `auto`: prefers `AUTO_SELECTION_UNIVERSE`; if that is empty it ranks targets from fetched ticker quote volume, removes `EXCLUDED_TARGETS`, then limits to `MAX_SELECTED_ASSETS`.

## Decision behavior

- 기본 전략은 **분할 매수 / 분할 매도**입니다. 한 번에 전량 매수/매도하지 않고, 잔고·보유 수량·최근 체결을 함께 보고 보수적으로 나눠서 판단합니다.
- `RISK_PROFILE=conservative|balanced|aggressive`는 주문금액, 현금 보존, 거래 횟수, 보유 포지션 수 같은 기본 안전 기준을 자동으로 정합니다.
- 세부 숫자 설정은 모두 optional override입니다. 비워두면 `RISK_PROFILE` 기준값을 사용합니다.
- `default` profile: keeps the existing conservative behavior, allowing capped buys when flat and capped sells when a held position reaches the take-profit or stop-loss band.
- `stablecoin` profile: auto-applies to `USDC` and `USDT` unless overridden, halves per-buy sizing, blocks sells, and only accumulates while daily trade and buy caps still have room.
- `buy`: only when there is no current position, available KRW remains above `MIN_CASH_RESERVE_KRW`, sizing stays within `MAX_ORDER_KRW`, `MAX_POSITION_PER_ASSET_KRW`, `MAX_DAILY_BUY_KRW`, `MAX_TRADES_PER_DAY`, `MAX_OPEN_POSITIONS`, and `MAX_PORTFOLIO_EXPOSURE_PCT`, and the target is outside the cooldown window.
- `sell`: only when a position exists, the resolved profile allows sells, average entry is available, and the current best bid is at least 3% above or 5% below average entry; the recommended quantity is limited by `SELL_FRACTION_OF_POSITION`.
- `hold`: default whenever account data is unavailable, prices are incomplete, average entry is missing, cooldown is active, daily caps are exhausted, or no safe budget remains.

Dry-run output now includes the resolved profile per target, signal details, daily risk-cap usage, portfolio-cap usage, future live-execution block reasons, hold explanations, a small account preview, a portfolio snapshot, and per-target decisions whenever Coinone credentials are present.

## Project layout

```text
src/
  agent/          Agent snapshot, contract validation, provider, dry-run execution, and state persistence
  adapters/       Local CLI wrapper for coinone --json
  cli/            Command entrypoints
  config/         Env parsing and app config
  reporting/      Slack delivery, issue drafting, and report orchestration
  trading/        Selection, market snapshot loading, and dry-run workflow
scripts/
  install-coinone-cli.mjs
```

## Local verification

```bash
cp .env.example .env
npm install
npm run coinone:install
npm run coinone:doctor
npm run build
RISK_PROFILE=balanced npm run trade:once
MARKET_DATA_MODE=mock npm run agent:decision
MARKET_DATA_MODE=mock npm run report:agent-trade-run
MARKET_DATA_MODE=mock AGENT_DECISION_PROVIDER=openai-compatible AGENT_PROVIDER_ENDPOINT=http://127.0.0.1:4010/v1/chat/completions AGENT_PROVIDER_API_KEY=test-key AGENT_PROVIDER_MODEL=stub-model npm run agent:decision
MARKET_DATA_MODE=mock npm run trade:once
npm run trade:once
MARKET_DATA_MODE=mock npm run trade:once
MARKET_DATA_MODE=mock GITHUB_CREATE_ISSUES=false npm run report:daily
MARKET_DATA_MODE=mock GITHUB_CREATE_ISSUES=false npm run report:monthly
npm run report:trade-run
```

Expected result:

- `npm run trade:once` prints a dry-run JSON plan that includes `marketDataSource`, selected ticker snapshots, a `portfolio` snapshot, and per-target `decisions`.
- `MARKET_DATA_MODE=mock npm run agent:decision` prints a Korean dry-run summary plus a JSON payload with a normalized `snapshot`, validated `decision`, validated `execution` record, persisted file paths, and no order placement.
- `MARKET_DATA_MODE=mock npm run report:agent-trade-run` writes `artifacts/agent-trade-run/result.json`, `summary.md`, and `status.json`, and copies the latest persisted agent snapshot/decision/execution/state JSON files into the same artifact bundle.
- `MARKET_DATA_MODE=mock AGENT_DECISION_PROVIDER=openai-compatible ... npm run agent:decision` either records a model-backed dry-run decision or fails closed before execution persistence unless mock fallback is explicitly enabled.
- The agent run writes `snapshots/latest.json`, `decisions/latest.json`, `executions/latest.json`, and `state/latest.json` plus dated files beneath `artifacts/agent-decision/`.
- Each decision now includes English internal reasoning/risk/provider metadata plus a Korean `userFacing` summary block for CLI/reporting adapters.
- `npm run coinone:doctor` prints the vendored Coinone CLI runtime/auth health status.
- `MARKET_DATA_MODE=mock npm run trade:once` returns `hold` decisions because mock mode does not read private account endpoints.
- `MARKET_DATA_MODE=mock npm run trade:once` prints the same dry-run structure using deterministic local fixture data only.
- `MARKET_DATA_MODE=mock GITHUB_CREATE_ISSUES=false npm run report:daily` prints JSON metadata with a markdown draft path plus action-needed reasons instead of creating a GitHub issue.
- `MARKET_DATA_MODE=mock GITHUB_CREATE_ISSUES=false npm run report:monthly` does the same for the monthly issue format.

To enable automatic GitHub issue creation and Slack link delivery:

```bash
GITHUB_REPOSITORY=owner/repo \
GITHUB_TOKEN=your-github-token \
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... \
MARKET_DATA_MODE=mock \
npm run report:daily
```

This still does not place orders; it only creates dry-run report drafts and optional GitHub issues around the simulated trade plan.

To run the same agent-driven dry-run in GitHub Actions:

1. Open the `Agent Trade Run` workflow.
2. Leave `agent_decision_provider=mock` for the safest default, or switch to `openai-compatible` only after setting `AGENT_PROVIDER_ENDPOINT`, `AGENT_PROVIDER_MODEL`, and optional prompt/runtime vars in repository variables plus `AGENT_PROVIDER_API_KEY` in repository secrets.
3. Trigger the workflow and download the `agent-trade-run-artifacts` bundle to inspect the Korean summary and copied decision/execution JSON files.

To enable account-based 판단 in dry-run mode:

```bash
COINONE_ACCESS_TOKEN=your-access-token \
COINONE_SECRET_KEY=your-secret-key \
npm run trade:once
```

This still does not place orders; it only allows `coinone --json auth status`, `coinone --json balances list`, and `coinone --json orders completed` to inform the decision.

### Recommended minimum `.env`

For most users, these are enough:

```bash
DRY_RUN=true
ENABLE_LIVE_TRADING=false
SELECTION_MODE=allowlist
TRADE_TARGETS=USDC
RISK_PROFILE=balanced
COINONE_ACCESS_TOKEN=...
COINONE_SECRET_KEY=...
SLACK_WEBHOOK_URL=...
GITHUB_REPOSITORY=owner/repo
```

Everything else in `.env.example` is optional or advanced.
