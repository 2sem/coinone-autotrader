export type StrategyPresetName = "zero-fee-grid" | "low-fee-balance" | "standard-net-profit";

export function resolveStrategyPreset(input: {
  makerFeeBps?: number;
  takerFeeBps?: number;
}): StrategyPresetName {
  const feeValues = [input.makerFeeBps, input.takerFeeBps].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (feeValues.length === 0) {
    return "standard-net-profit";
  }

  const maxFeeBps = Math.max(...feeValues);
  if (maxFeeBps === 0) {
    return "zero-fee-grid";
  }

  if (maxFeeBps <= 5) {
    return "low-fee-balance";
  }

  return "standard-net-profit";
}
