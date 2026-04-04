import type { AppConfig } from "../config/env.js";

export interface SelectionPlan {
  mode: AppConfig["selectionMode"];
  targets: string[];
  excludedTargets: string[];
  notes: string[];
}

export interface SelectionInputs {
  availableTargets?: string[];
  rankedTargets?: string[];
}

export function resolveSelectionPlan(config: AppConfig, inputs: SelectionInputs = {}): SelectionPlan {
  const excluded = new Set(config.excludedTargets);
  const availableTargets = inputs.availableTargets ? new Set(inputs.availableTargets) : undefined;

  if (config.selectionMode === "allowlist") {
    const requestedTargets = config.tradeTargets.filter((target) => !excluded.has(target));
    const unavailableTargets = availableTargets
      ? requestedTargets.filter((target) => !availableTargets.has(target))
      : [];
    const targets = availableTargets
      ? requestedTargets.filter((target) => availableTargets.has(target))
      : requestedTargets;
    const notes = [
      "Selection mode: allowlist.",
      targets.length === 0
        ? "No trade targets remain after exclusions."
        : "Targets come directly from TRADE_TARGETS."
    ];

    if (unavailableTargets.length > 0) {
      notes.push(`Dropped unavailable markets: ${unavailableTargets.join(", ")}.`);
    }

    return {
      mode: config.selectionMode,
      targets,
      excludedTargets: [...excluded],
      notes
    };
  }

  const baseCandidates =
    config.autoSelectionUniverse.length > 0
      ? config.autoSelectionUniverse
      : inputs.rankedTargets ?? inputs.availableTargets ?? [];

  const candidates = baseCandidates.filter((target) => !excluded.has(target) && (!availableTargets || availableTargets.has(target)));
  const targets = candidates.slice(0, config.maxSelectedAssets);
  const autoNotes = ["Selection mode: auto."];

  if (config.autoSelectionUniverse.length > 0) {
    autoNotes.push("Ranking comes from AUTO_SELECTION_UNIVERSE after market availability checks.");
  } else if ((inputs.rankedTargets ?? []).length > 0) {
    autoNotes.push("Ranking comes from live or mock market quote volume data.");
  } else {
    autoNotes.push("No market ranking input was available for auto selection.");
  }

  return {
    mode: config.selectionMode,
    targets,
    excludedTargets: [...excluded],
    notes: [...autoNotes, `Selected up to MAX_SELECTED_ASSETS=${config.maxSelectedAssets}.`]
  };
}
