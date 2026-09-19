import {
  CONFIDENCE_PENALTIES,
  CONFIDENCE_WEIGHTS,
  LARGE_PRICE_CHANGE_PCT,
  MAX_TOTAL_PENALTY,
  STALE_DATA_DAYS,
  type AgentNameValue,
  type DemandOutput,
  type InventoryOutput,
  type MarketIntelOutput,
  type StrategyOutput,
} from "@pricewise/shared";
import { AGENT_DISPLAY_NAMES } from "@pricewise/shared";

export interface ConfidenceInputs {
  market: MarketIntelOutput | null;
  demand: DemandOutput | null;
  inventory: InventoryOutput | null;
  strategy: StrategyOutput;
  priceDeltaPct: number;
  failedAgents: AgentNameValue[];
}

export interface ConfidencePenalty {
  reason: string;
  amount: number;
}

export interface ConfidenceBreakdown {
  base: number;
  penalties: ConfidencePenalty[];
  /** Total actually deducted, after the cap. */
  totalPenalty: number;
  final: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Deterministic and pure: same inputs, same output, no I/O, no clock.
 *
 * This is the answer to "why not just ask the model for a confidence score".
 * A model's self-report is uncalibrated and unreproducible, ask twice, get two
 * numbers. Here each agent reports confidence in its own narrow analysis, which
 * models are comparatively decent at, and the *combination* is arithmetic:
 * reproducible, unit-testable, and explainable as a list of named deductions
 * rather than an opaque number (rule R8).
 */
export function computeConfidence(i: ConfidenceInputs): ConfidenceBreakdown {
  // Weighted mean over agents that actually produced output. A missing agent's
  // weight is redistributed rather than counted as zero, losing an input is
  // handled by an explicit named penalty below, not by silently halving the
  // score, which would double-count the failure.
  let weightSum = 0;
  let accumulated = 0;

  const add = (value: number | undefined, weight: number) => {
    if (value === undefined) return;
    accumulated += value * weight;
    weightSum += weight;
  };

  add(i.market?.confidence, CONFIDENCE_WEIGHTS.market);
  add(i.demand?.confidence, CONFIDENCE_WEIGHTS.demand);
  add(i.inventory?.confidence, CONFIDENCE_WEIGHTS.inventory);
  add(i.strategy.confidence, CONFIDENCE_WEIGHTS.strategy);

  const base = weightSum > 0 ? accumulated / weightSum : 0;
  const penalties: ConfidencePenalty[] = [];

  if (i.market && i.market.dataAgeDays > STALE_DATA_DAYS) {
    penalties.push({
      reason: `Competitor data is ${Math.round(i.market.dataAgeDays)} days old`,
      amount: CONFIDENCE_PENALTIES.staleData,
    });
  }

  if (i.market && i.demand && signalsDisagree(i.market, i.demand)) {
    penalties.push({
      reason: "Market trend and demand trend point in opposite directions",
      amount: CONFIDENCE_PENALTIES.conflictingSignals,
    });
  }

  for (const agent of i.failedAgents) {
    penalties.push({
      reason: `${AGENT_DISPLAY_NAMES[agent]} did not complete`,
      amount: CONFIDENCE_PENALTIES.missingAgent,
    });
  }

  if (Math.abs(i.priceDeltaPct) > LARGE_PRICE_CHANGE_PCT) {
    penalties.push({
      reason: `Large price change (${(i.priceDeltaPct * 100).toFixed(1)}%)`,
      amount: CONFIDENCE_PENALTIES.largePriceChange,
    });
  }

  if (i.inventory && i.inventory.constraints.length > 0) {
    penalties.push({
      reason: `${i.inventory.constraints.length} inventory constraint(s) active`,
      amount: CONFIDENCE_PENALTIES.inventoryConstraints,
    });
  }

  // Capped, so an unlucky pile-up of independent conditions cannot drive a
  // sound recommendation to zero and make the score meaningless.
  const rawTotal = penalties.reduce((sum, p) => sum + p.amount, 0);
  const totalPenalty = Math.min(rawTotal, MAX_TOTAL_PENALTY);

  return {
    base: round2(base),
    penalties,
    totalPenalty: round2(totalPenalty),
    final: round2(clamp01(base - totalPenalty)),
  };
}

/** Market says prices are falling while demand accelerates, or the reverse.
 *  Not "wrong", but two specialists disagreeing is a reason for a human to
 *  look, which is exactly what the penalty causes. */
function signalsDisagree(market: MarketIntelOutput, demand: DemandOutput): boolean {
  return (
    (market.trend === "falling" && demand.velocityTrend === "accelerating") ||
    (market.trend === "rising" && demand.velocityTrend === "decelerating")
  );
}

/**
 * Caps downstream confidence when the upstream input was shaky.
 *
 * PRD requirement AI-4 says this MUST happen. The implementation plan asked the
 * model to do it in its prompt, which contradicts rule R8 and cannot be tested
 * deterministically, so it is enforced here instead.
 */
export function capForWeakUpstream(downstream: number, upstreamConfidence: number | null): number {
  if (upstreamConfidence === null || upstreamConfidence >= 0.5) return downstream;
  return Math.min(downstream, 0.6);
}
