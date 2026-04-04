import type { AgentDecisionContract, AgentMarketDecisionSnapshot } from "./contracts.js";

export function buildKoreanDecisionSummary(input: {
  snapshot: AgentMarketDecisionSnapshot;
  action: AgentDecisionContract["action"];
  target?: string;
  previousAction?: AgentDecisionContract["action"];
  accountReady: boolean;
  hasExistingPosition: boolean;
}): AgentDecisionContract["userFacing"] {
  const targetLabel = input.target ?? "미정";
  const actionLabel = localizeAction(input.action);
  const hasOrderSizing = input.action !== "hold";

  return {
    locale: "ko-KR",
    headline: `${targetLabel} ${actionLabel} 판단`,
    summary: buildSummary(input, targetLabel),
    riskNotes: buildRiskNotes(input, hasOrderSizing),
    evidenceNotes: buildEvidenceNotes(input, hasOrderSizing)
  };
}

function buildSummary(
  input: {
    snapshot: AgentMarketDecisionSnapshot;
    action: AgentDecisionContract["action"];
    target?: string;
    previousAction?: AgentDecisionContract["action"];
    accountReady: boolean;
    hasExistingPosition: boolean;
  },
  targetLabel: string
): string {
  if (input.snapshot.selectedTargets.length === 0) {
    return "선택된 대상이 없어 이번 드라이런에서는 보수적으로 홀드합니다.";
  }

   if (input.action === "buy") {
    return `${targetLabel} 매수 제안이 생성됐지만, 이 경로는 드라이런 전용이라 주문은 기록만 하고 실행하지 않습니다.`;
  }

  if (input.action === "sell") {
    return `${targetLabel} 매도 제안이 생성됐지만, 이 경로는 드라이런 전용이라 주문은 기록만 하고 실행하지 않습니다.`;
  }

  if (!input.accountReady) {
    return "읽기 전용 계좌 정보가 없어 주문 제안 없이 홀드로 유지합니다.";
  }

  if (input.previousAction) {
    return `이전 판단(${localizeAction(input.previousAction)}) 직후 진동을 피하기 위해 ${targetLabel}을 홀드합니다.`;
  }

  if (input.hasExistingPosition) {
    return `${targetLabel} 기존 보유분이 있어, 현재 mock 제공자는 실주문 없이 보수적으로 상태만 기록합니다.`;
  }

  return `${targetLabel}에 대해 드라이런 안전장치를 우선 적용하며, 현재 에이전트 경로는 실주문 없이 홀드 판단만 반환합니다.`;
}

function buildRiskNotes(input: {
  snapshot: AgentMarketDecisionSnapshot;
  accountReady: boolean;
}, hasOrderSizing: boolean): string[] {
  return [
    "이 저장소는 여전히 드라이런 전용이며 실제 주문은 전송되지 않습니다.",
    input.snapshot.liveTradingBlocked
      ? "이번 실행에서도 라이브 트레이딩이 차단되어 있습니다."
      : "라이브 트레이딩이 켜져 있어도 현재 에이전트 경로에서는 주문을 실행하지 않습니다.",
    hasOrderSizing
      ? "모델이 주문 크기를 제안하더라도 실행 단계에서는 항상 차단됩니다."
      : "주문 크기가 없거나 홀드 판단이어서 실행 가능한 주문은 없습니다.",
    input.accountReady
      ? "계좌 정보는 읽기 전용 참고 자료로만 사용됩니다."
      : "계좌 정보가 없어 보수적 홀드 판단을 유지합니다."
  ];
}

function buildEvidenceNotes(input: {
  snapshot: AgentMarketDecisionSnapshot;
  target?: string;
  hasExistingPosition: boolean;
}, hasOrderSizing: boolean): string[] {
  return [
    `선택된 대상 수: ${input.snapshot.selectedTargets.length}개`,
    `우선 검토 대상: ${input.target ?? "없음"}`,
    input.hasExistingPosition ? "기존 포지션이 감지되었습니다." : "기존 포지션이 감지되지 않았습니다.",
    hasOrderSizing ? "주문 크기 제안이 포함되었습니다." : "주문 크기 제안은 포함되지 않았습니다."
  ];
}

function localizeAction(action: AgentDecisionContract["action"]): string {
  if (action === "buy") {
    return "매수";
  }

  if (action === "sell") {
    return "매도";
  }

  return "홀드";
}
