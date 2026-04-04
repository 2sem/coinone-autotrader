import type { TradeDecision } from "../trading/trade-once.js";

export function localizeReportDisplayTitle(kind: "daily" | "monthly", periodLabel: string): string {
  return kind === "daily"
    ? `코인원 ${periodLabel} 일일 보고`
    : `코인원 ${periodLabel} 월간 보고`;
}

export function localizeWorkflowLabel(workflow: string): string {
  if (workflow === "dry-run only") {
    return "드라이런 전용";
  }

  return workflow;
}

export function localizeSelectionMode(mode: string): string {
  if (mode === "allowlist") {
    return "허용 목록";
  }

  if (mode === "auto") {
    return "자동 선택";
  }

  return mode;
}

export function localizeMarketDataMode(mode: string): string {
  if (mode === "mock") {
    return "모의 데이터";
  }

  if (mode === "live") {
    return "실데이터";
  }

  if (mode === "auto") {
    return "자동";
  }

  return mode;
}

export function localizeMarketDataSource(source: string): string {
  if (source === "mock") {
    return "모의 데이터";
  }

  if (source === "live-cli") {
    return "CLI 실데이터";
  }

  return source;
}

export function localizeAccountSource(source: string): string {
  if (source === "skipped") {
    return "건너뜀";
  }

  if (source === "live-cli") {
    return "CLI 실데이터";
  }

  return source;
}

export function localizeTradeProfileName(profile: string): string {
  if (profile === "stablecoin") {
    return "스테이블코인";
  }

  return "기본";
}

export function localizeTradeAction(action: string): string {
  if (action === "buy") {
    return "매수";
  }

  if (action === "sell") {
    return "매도";
  }

  return "홀드";
}

export function localizeTradeDecisionReason(reason: string): string {
  const exactMap: Record<string, string> = {
    "Hold: balances and completed-order history are unavailable, so daily caps cannot be enforced safely.": "잔고와 체결 이력이 없어 일일 한도를 안전하게 검증할 수 없어 홀드합니다.",
    "Hold: ticker data is missing for this target.": "이 대상의 시세 데이터가 없어 홀드합니다.",
    "Hold: stablecoin profile keeps existing exposure and does not emit dry-run sell signals.": "스테이블코인 프로필은 기존 보유를 유지하고 드라이런 매도 신호를 내지 않아 홀드합니다.",
    "Hold: a position exists, but bid price or average entry is missing.": "보유 수량은 있지만 매수 1호가 또는 평균 진입가가 없어 홀드합니다.",
    "Hold: configured sell fraction produces no sellable quantity.": "설정된 매도 비율로는 매도 가능한 수량이 계산되지 않아 홀드합니다.",
    "Hold: current price remains inside the conservative sell band.": "현재 가격이 보수적 매도 밴드 안에 있어 홀드합니다.",
    "Hold: available KRW balance is missing.": "사용 가능한 KRW 잔고 정보가 없어 홀드합니다.",
    "Hold: ask price or mark price is missing, so buy sizing is uncertain.": "매도 1호가 또는 기준 가격이 없어 매수 규모를 안전하게 계산할 수 없어 홀드합니다.",
    "Hold: configured caps leave no safe buy budget.": "설정된 한도 내에서 안전한 매수 예산이 남아 있지 않아 홀드합니다.",
    "Hold: no position is available, but average entry data is unexpectedly present.": "보유 수량은 없는데 평균 진입가가 남아 있어 계좌 스냅샷이 불일치하므로 홀드합니다.",
    "Hold: ask price is too far above the current mark price for a conservative entry.": "매도 1호가가 현재 기준 가격보다 높아 보수적 진입 조건에 맞지 않아 홀드합니다.",
    "Buy: stablecoin profile allows a capped accumulation buy within daily risk limits.": "스테이블코인 프로필 기준으로 일일 리스크 한도 안에서 제한된 분할 매수를 제안합니다.",
    "Buy: no current position, cash is above reserve, and sizing stays within configured caps.": "현재 보유가 없고 현금 여력이 있으며 주문 규모가 설정 한도 안에 있어 매수를 제안합니다."
  };

  if (exactMap[reason]) {
    return exactMap[reason];
  }

  let match = /^Hold: last completed order was (\d+) minutes ago, inside cooldown (\d+)m\.$/.exec(reason);
  if (match) {
    return `마지막 체결 후 ${match[1]}분이 지나 아직 쿨다운 ${match[2]}분 안이므로 홀드합니다.`;
  }

  match = /^Sell: best bid is at least (\d+)% above average entry\.$/.exec(reason);
  if (match) {
    return `매수 1호가가 평균 진입가 대비 ${match[1]}% 이상 높아 매도를 제안합니다.`;
  }

  match = /^Sell: best bid is at least (\d+)% below average entry\.$/.exec(reason);
  if (match) {
    return `매수 1호가가 평균 진입가 대비 ${match[1]}% 이상 낮아 손절 매도를 제안합니다.`;
  }

  match = /^Hold: available KRW stays at or below MIN_CASH_RESERVE_KRW=(.+)\.$/.exec(reason);
  if (match) {
    return `사용 가능 KRW가 MIN_CASH_RESERVE_KRW=${match[1]} 이하라서 홀드합니다.`;
  }

  match = /^Hold: open positions already reached MAX_OPEN_POSITIONS=(.+)\.$/.exec(reason);
  if (match) {
    return `열린 포지션 수가 MAX_OPEN_POSITIONS=${match[1]}에 도달해 신규 진입을 홀드합니다.`;
  }

  match = /^Hold: portfolio exposure already reached MAX_PORTFOLIO_EXPOSURE_PCT=(.+)\.$/.exec(reason);
  if (match) {
    return `포트폴리오 익스포저가 MAX_PORTFOLIO_EXPOSURE_PCT=${match[1]}에 도달해 추가 매수를 홀드합니다.`;
  }

  match = /^Hold: completed trades today already reached MAX_TRADES_PER_DAY=(.+)\.$/.exec(reason);
  if (match) {
    return `오늘 체결 횟수가 MAX_TRADES_PER_DAY=${match[1]}에 도달해 홀드합니다.`;
  }

  match = /^Hold: completed buy value today already reached MAX_DAILY_BUY_KRW=(.+)\.$/.exec(reason);
  if (match) {
    return `오늘 누적 매수 금액이 MAX_DAILY_BUY_KRW=${match[1]}에 도달해 홀드합니다.`;
  }

  match = /^Hold: daily risk sizing is defined in KRW and the selected quote currency is not KRW\.$/.exec(reason);
  if (match) {
    return "일일 리스크 산정이 KRW 기준인데 선택된 기준 통화가 KRW가 아니어서 홀드합니다.";
  }

  return reason;
}

export function localizeSignalSummary(summary: string): string {
  let match = /^(default|stablecoin) profile sees an existing position and evaluates sell-or-hold conditions\.$/.exec(summary);
  if (match) {
    return `${localizeTradeProfileName(match[1])} 프로필 기준으로 기존 보유를 확인했고 매도 또는 홀드 조건을 점검합니다.`;
  }

  match = /^(default|stablecoin) profile sees no position and evaluates a fresh entry conservatively\.$/.exec(summary);
  if (match) {
    return `${localizeTradeProfileName(match[1])} 프로필 기준으로 기존 보유가 없어 신규 진입 가능성을 보수적으로 점검합니다.`;
  }

  return summary;
}

export function localizeRiskLine(reason: string): string {
  const exactMap: Record<string, string> = {
    "Daily KRW risk caps only apply when QUOTE_CURRENCY=KRW.": "일일 KRW 리스크 한도는 `QUOTE_CURRENCY=KRW`일 때만 적용됩니다.",
    "READ_ACCOUNT_DATA and valid Coinone credentials are required for conservative daily-cap enforcement.": "보수적 일일 한도 적용에는 `READ_ACCOUNT_DATA`와 유효한 코인원 인증 정보가 필요합니다.",
    "A recommendation is blocked until live or mock ticker data is available for the selected target.": "선택 대상의 live 또는 mock 시세가 준비되기 전까지 추천이 차단됩니다.",
    "Sell decisions require both a current bid and a valid average entry price.": "매도 판단에는 현재 매수 1호가와 유효한 평균 진입가가 모두 필요합니다.",
    "Increase SELL_FRACTION_OF_POSITION or hold a larger balance to surface a sell suggestion.": "매도 제안을 보려면 `SELL_FRACTION_OF_POSITION`을 높이거나 더 큰 보유 수량이 필요합니다.",
    "No take-profit or stop-loss threshold is active yet.": "아직 익절 또는 손절 임계값이 충족되지 않았습니다.",
    "Buy sizing needs a current KRW balance snapshot.": "매수 규모 계산에는 최신 KRW 잔고 스냅샷이 필요합니다.",
    "Conservative entries require both an ask and a mark price.": "보수적 진입 판단에는 매도 1호가와 기준 가격이 모두 필요합니다.",
    "Cash reserve protection leaves no safe buy budget.": "현금 보유 보호 규칙 때문에 안전한 매수 예산이 남아 있지 않습니다.",
    "Portfolio concentration guard blocks new entries until an existing position is reduced or closed.": "기존 포지션이 줄거나 청산되기 전까지 포트폴리오 집중도 제한으로 신규 진입이 차단됩니다.",
    "Portfolio-level exposure cap blocks additional buys.": "포트폴리오 익스포저 한도 때문에 추가 매수가 차단됩니다.",
    "Daily trade count cap is exhausted.": "일일 거래 횟수 한도가 모두 소진되었습니다.",
    "Daily buy budget is exhausted from completed orders.": "체결 이력 기준 일일 매수 예산이 모두 소진되었습니다.",
    "Stablecoin accumulation halves per-trade buy sizing before a buy is considered.": "스테이블코인 누적 매수 프로필은 매수 검토 전에 1회 매수 규모를 절반으로 제한합니다.",
    "Position and order caps leave no remaining allocation.": "포지션 및 주문 한도 때문에 남은 배정 금액이 없습니다.",
    "The account snapshot looks inconsistent, so the engine stays conservative.": "계좌 스냅샷이 일관되지 않아 엔진이 보수적으로 홀드합니다.",
    "Entry is blocked until the ask converges closer to the mark price.": "매도 1호가가 기준 가격에 더 가까워질 때까지 진입이 차단됩니다.",
    "ENABLE_LIVE_TRADING=false": "`ENABLE_LIVE_TRADING=false`로 설정되어 있습니다.",
    "TRADING_KILL_SWITCH=true": "`TRADING_KILL_SWITCH=true`가 활성화되어 있습니다.",
    "Repository remains dry-run only until a guarded live order adapter is implemented.": "보호 장치가 있는 라이브 주문 어댑터가 추가되기 전까지 저장소는 드라이런 전용입니다."
  };

  if (exactMap[reason]) {
    return exactMap[reason];
  }

  const cooldownMatch = /^Cooldown remains active for (\d+) more minutes\.$/.exec(reason);
  if (cooldownMatch) {
    return `쿨다운이 앞으로 ${cooldownMatch[1]}분 더 유지됩니다.`;
  }

  return reason;
}

export function localizeTradeNotes(notes: string[]): string[] {
  return notes.map((note) => {
    if (note === "MARKET_DATA_MODE=mock forces local fixture data.") {
      return "`MARKET_DATA_MODE=mock` 설정으로 로컬 fixture 데이터를 강제로 사용했습니다.";
    }

    if (note === "Generated 5 local mock markets for dry-run safety.") {
      return "드라이런 안전 검증을 위해 로컬 mock 마켓 5개를 생성했습니다.";
    }

    if (note === "Selection mode: allowlist.") {
      return "선택 모드는 allowlist입니다.";
    }

    if (note === "Targets come directly from TRADE_TARGETS.") {
      return "대상 목록은 `TRADE_TARGETS` 설정에서 직접 가져왔습니다.";
    }

    if (note === "Mock mode does not call private account endpoints.") {
      return "mock 모드에서는 private account 엔드포인트를 호출하지 않습니다.";
    }

    if (note === "No selected ticker data is available for this dry-run plan.") {
      return "이번 드라이런 계획에 포함된 선택 대상 시세가 없습니다.";
    }

    let match = /^Included (\d+) selected ticker snapshots from (.+) data\.$/.exec(note);
    if (match) {
      return `선택된 대상 시세 ${match[1]}건을 ${match[2]} 데이터로 반영했습니다.`;
    }

    match = /^Strategy profiles enabled: default=(.+); auto-stablecoin targets=(.+)\.$/.exec(note);
    if (match) {
      return `전략 프로필: 기본=${localizeTradeProfileName(match[1])}, 자동 스테이블코인 대상=${match[2] === "none" ? "없음" : match[2]}.`;
    }

    match = /^Daily buy cap MAX_DAILY_BUY_KRW=(.+) and trade cap MAX_TRADES_PER_DAY=(.+) are enforced from completed-order history when account reads are available\.$/.exec(note);
    if (match) {
      return `계좌 조회가 가능하면 체결 이력을 기준으로 MAX_DAILY_BUY_KRW=${match[1]}, MAX_TRADES_PER_DAY=${match[2]} 한도를 적용합니다.`;
    }

    match = /^Portfolio caps: MAX_OPEN_POSITIONS=(.+), MAX_PORTFOLIO_EXPOSURE_PCT=(.+)\.$/.exec(note);
    if (match) {
      return `포트폴리오 한도: MAX_OPEN_POSITIONS=${match[1]}, MAX_PORTFOLIO_EXPOSURE_PCT=${match[2]}.`;
    }

    if (note === "ENABLE_LIVE_TRADING=true but TRADING_KILL_SWITCH=true, so any future live execution path would remain blocked.") {
      return "`ENABLE_LIVE_TRADING=true`여도 `TRADING_KILL_SWITCH=true`라서 향후 라이브 실행 경로는 계속 차단됩니다.";
    }

    if (note === "ENABLE_LIVE_TRADING=true is configured, but this repository still remains dry-run only until a guarded live adapter is added.") {
      return "`ENABLE_LIVE_TRADING=true`로 설정되어 있어도 보호 장치가 있는 라이브 어댑터가 추가되기 전까지는 드라이런 전용입니다.";
    }

    if (note === "ENABLE_LIVE_TRADING=false keeps future live execution paths blocked by default.") {
      return "`ENABLE_LIVE_TRADING=false`라서 향후 라이브 실행 경로가 기본적으로 차단됩니다.";
    }

    if (note === "Decision engine stayed fully conservative and recommended hold for every selected target.") {
      return "의사결정 엔진이 모든 선택 대상에 대해 보수적으로 홀드를 유지했습니다.";
    }

    if (note === "Decision engine produced deterministic buy/sell/hold recommendations without placing orders.") {
      return "의사결정 엔진이 실제 주문 없이 결정론적 매수/매도/홀드 추천을 생성했습니다.";
    }

    if (note === "Live order placement remains intentionally disabled.") {
      return "실제 주문 전송은 의도적으로 비활성화되어 있습니다.";
    }

    if (note === "DRY_RUN is enabled; no external side effects are allowed.") {
      return "`DRY_RUN`이 활성화되어 외부 부작용이 허용되지 않습니다.";
    }

    if (note === "DRY_RUN is disabled, but execution still remains simulation-only.") {
      return "`DRY_RUN`이 비활성화되어 있어도 실행은 여전히 시뮬레이션 전용입니다.";
    }

    return note;
  });
}

export function localizeTradeDecisionForReport(decision: TradeDecision): {
  profileUsed: string;
  action: string;
  reason: string;
  signalSummary: string;
  executionBlockedReasons: string[];
  holdReasons: string[];
} {
  return {
    profileUsed: localizeTradeProfileName(decision.profileUsed),
    action: localizeTradeAction(decision.action),
    reason: localizeTradeDecisionReason(decision.reason),
    signalSummary: localizeSignalSummary(decision.signal.summary),
    executionBlockedReasons: decision.risk.executionBlockedReasons.map(localizeRiskLine),
    holdReasons: decision.risk.holdReasons.map(localizeRiskLine)
  };
}
