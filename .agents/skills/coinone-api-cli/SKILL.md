---
name: coinone-api-cli
description: Use the local Coinone CLI to query Coinone public APIs and safe read-only private APIs from this repository. Prefer this skill when the goal is to fetch market data, balances, fees, or order history through the CLI rather than calling HTTP endpoints directly.
---

Use this skill when the user wants to work with Coinone data through the CLI in this repository.

## When to Use This Skill

Activate this skill when the user wants to:

- diagnose a global install or runtime setup problem with the CLI
- call Coinone public APIs from the command line
- inspect safe read-only private API data with env-based auth
- script Coinone queries for developers or AI agents
- debug or demonstrate this repository's CLI behavior
- use Git-based installation or local execution examples

## Repo and CLI Discovery

Use this skill in the repository that contains:

- `package.json`
- `src/bin/coinone.ts`
- `README.md`

Primary execution forms:

- inside the repo: `npm run cli -- <command>`
- after build: `node dist/bin/coinone.js <command>`
- after Git/global install: `coinone <command>`

## Preferred Execution Strategy

Use commands in this order:

1. If working inside the repository, prefer:
   - `npm run cli -- <command>`
2. If the project has already been built but not installed globally, use:
   - `node dist/bin/coinone.js <command>`
3. If the CLI is installed globally, use:
   - `coinone <command>`

For first contact or troubleshooting, probe in this order:

1. `npm run cli -- doctor --json`
2. `npm run cli -- --help`
3. `npm run cli -- markets list --json`
4. `npm run cli -- auth status --json`

## Core Usage Rules

- Prefer `--json` for agent and automation workflows.
- Prefer the CLI over direct Coinone HTTP calls when the repository already supports the endpoint.
- Never print, hardcode, or request private credentials in normal output.
- Private auth must come from environment variables:
  - `COINONE_ACCESS_TOKEN`
  - `COINONE_SECRET_KEY`
- Use `--timeout <ms>` in automation to fail fast.
- Use `--base-url <url>` only for mock servers, proxies, or alternate compatible hosts.
- Do not parse human table output if `--json` is available.

## Supported Command Surface

### Local diagnostics

- `coinone doctor`

### Public

- `coinone markets list`
- `coinone markets get <targetCurrency> --quote <quoteCurrency>`
- `coinone currencies list`
- `coinone currencies get <currency>`
- `coinone ticker get <targetCurrency> --quote <quoteCurrency>`
- `coinone ticker list [--quote <quoteCurrency>]`
- `coinone orderbook get <targetCurrency> --quote <quoteCurrency> [--size <n>]`
- `coinone trades list <targetCurrency> --quote <quoteCurrency> [--size <n>]`
- `coinone range-units get <targetCurrency> --quote <quoteCurrency>`

### Private read-only

- `coinone auth status`
- `coinone balances list`
- `coinone balances get <currency>`
- `coinone fees list`
- `coinone fees get --quote <quoteCurrency> --target <targetCurrency>`
- `coinone orders active [--quote <quoteCurrency>] [--target <targetCurrency>] [--type <type>]`
- `coinone orders get <orderId> --quote <quoteCurrency> --target <targetCurrency> [--user-order-id <id>]`
- `coinone orders completed --from <timestamp-ms|iso> --to <timestamp-ms|iso> [--size <1-100>] [--to-trade-id <id>] [--quote <quoteCurrency> --target <targetCurrency>]`

## Recommended Patterns

### Public market data

```bash
npm run cli -- --json ticker get btc --quote krw
npm run cli -- markets list --json
npm run cli -- orderbook get btc --quote krw --size 10 --json
```

### Private auth check

```bash
export COINONE_ACCESS_TOKEN="your-access-token"
export COINONE_SECRET_KEY="your-secret-key"
npm run cli -- doctor --json
npm run cli -- auth status --json
```

### Install and runtime diagnostics

```bash
npm run cli -- doctor
npm run cli -- doctor --json
coinone doctor --json
```

### Private read-only examples

```bash
npm run cli -- balances list --json
npm run cli -- fees get --quote krw --target btc --json
npm run cli -- orders completed --from 2026-01-01T00:00:00Z --to 2026-01-02T00:00:00Z --json
```

### Git-based installation

```bash
npm install -g git+https://github.com/2sem/coinone-api-cli.git
coinone --help
```

## Output and Parsing Guidance

- default output is for humans
- `--json` is the stable automation path
- `--output raw` is useful when debugging upstream Coinone payloads
- prefer normalized JSON fields over reverse-engineering Coinone raw payloads unless the task specifically requires raw output
- if a downstream step needs reliable parsing, rerun the command with `--json`
- for install/runtime debugging, use `coinone doctor --json` first because it does not require network access in the MVP

## Safety and Validation

- Do not attempt write-capable private trading actions through this skill.
- Keep usage focused on public data and safe read-only private commands.
- For private commands, fail clearly if env vars are missing instead of inventing credentials.
- For completed orders, respect the CLI validation rules:
  - `--from` and `--to` are required
  - max window is 90 days
  - `--quote` and `--target` must be passed together when filtering by pair

## Common Failure Cases

- Missing private env vars:
  - run `npm run cli -- doctor --json`
  - or `npm run cli -- auth status --json`
  - expect missing `COINONE_ACCESS_TOKEN` and/or `COINONE_SECRET_KEY`
- Global install works but `coinone` is not found:
  - compare `npm bin -g` with your shell `PATH`
  - use `coinone doctor` once the binary is reachable
  - remember that npm global bin paths vary across nvm, Homebrew, fnm, Volta, and system Node installs
- Timeout/network failures:
  - retry with `--timeout <ms>` adjusted upward
  - check network reachability to the Coinone API
- Invalid completed order window:
  - ensure `--from <= --to`
  - ensure the window is not larger than 90 days
- Incomplete pair filter:
  - pass both `--quote` and `--target`, or omit both
- Unexpected parsing need:
  - rerun with `--json`

## Verification Commands

When changing or validating the CLI, use:

```bash
npm test
npm run build
npm run cli -- --help
```

For packaging and install checks:

```bash
npm pack --dry-run
```
