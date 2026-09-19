import { money, percent } from "@/lib/format";
import type { AgentRunDto, FactorWeights, RecommendationDetailDto } from "@/lib/types";

/**
 * The four consequences of taking this price, derived from what the agents
 * actually reported.
 *
 * Every value is written as a transition rather than a bare number, because
 * "36.9%" tells an analyst nothing without the "38.2% →" in front of it. The
 * question being answered is "what changes if I approve", and a single figure
 * cannot answer it.
 */

export type Tone = "pos" | "neg" | "amber" | "neutral";

export interface Impact {
  label: string;
  value: string;
  tone: Tone;
  consequence: string;
}

function outputOf(runs: AgentRunDto[], agent: string): Record<string, unknown> | null {
  const run = runs.find((r) => r.agentName === agent);
  return (run?.output as Record<string, unknown> | null) ?? null;
}

function num(source: Record<string, unknown> | null, key: string): number | null {
  const value = source?.[key];
  return typeof value === "number" ? value : null;
}

export function deriveImpacts(rec: RecommendationDetailDto): Impact[] {
  const inventory = outputOf(rec.agentRuns, "INVENTORY_COST");
  const market = outputOf(rec.agentRuns, "MARKET_INTELLIGENCE");
  const demand = outputOf(rec.agentRuns, "DEMAND_FORECASTING");

  const current = rec.currentPriceAtTime;
  const proposed = rec.modifiedPrice ?? rec.recommendedPrice;
  const unitCost = num(inventory, "unitCost");
  const competitorMedian = num(market, "competitorMedian");

  const impacts: Impact[] = [];

  if (unitCost !== null && current > 0 && proposed > 0) {
    const before = (current - unitCost) / current;
    const after = (proposed - unitCost) / proposed;
    impacts.push({
      label: "Margin",
      value: `${percent(before, 1)} → ${percent(after, 1)}`,
      tone: after >= before ? "pos" : after < 0.1 ? "neg" : "amber",
      consequence:
        after >= before
          ? "Margin improves at the proposed price."
          : `Gives up ${percent(before - after, 1)} of margin to move the price.`,
    });
  }

  if (competitorMedian !== null && current > 0) {
    const before = (current - competitorMedian) / competitorMedian;
    const after = (proposed - competitorMedian) / competitorMedian;
    impacts.push({
      label: "Competitive position",
      value: `${signed(before)} → ${signed(after)}`,
      tone: Math.abs(after) < Math.abs(before) ? "pos" : "amber",
      consequence:
        Math.abs(after) < Math.abs(before)
          ? `Closes most of the gap to the ${money(competitorMedian)} median.`
          : `Moves further from the ${money(competitorMedian)} competitor median.`,
    });
  }

  const daysOfCover = num(inventory, "daysOfCover");
  const stockStatus = typeof inventory?.["stockStatus"] === "string" ? inventory["stockStatus"] : null;
  if (daysOfCover !== null) {
    impacts.push({
      label: "Inventory",
      value: `${Math.round(daysOfCover)} days of cover`,
      tone: stockStatus === "LOW" ? "amber" : stockStatus === "OVERSTOCKED" ? "amber" : "neutral",
      consequence:
        stockStatus === "LOW"
          ? "Stock is thin, which argues against discounting into scarcity."
          : stockStatus === "OVERSTOCKED"
            ? "Overstocked, so moving units matters more than holding price."
            : "Stock is healthy; no pressure either way.",
    });
  }

  const projected = num(demand, "projectedUnitDeltaPct");
  const velocity = typeof demand?.["velocityTrend"] === "string" ? demand["velocityTrend"] : null;
  if (projected !== null) {
    impacts.push({
      label: "Demand",
      value: `${signed(projected / 100)} units`,
      tone: projected >= 0 ? "pos" : "amber",
      consequence: velocity
        ? `Velocity is ${velocity}; the forecast assumes it holds.`
        : "Projected unit change at the proposed price.",
    });
  }

  return impacts;
}

function signed(fraction: number): string {
  const formatted = percent(Math.abs(fraction), 1);
  return `${fraction >= 0 ? "+" : "−"}${formatted}`;
}

/**
 * What each agent contributed, in plain language.
 *
 * The design asks for five weighted rows summing to 1.00. The system computes
 * FOUR factor weights, not five agent weights, and inventing a fifth to fill
 * the row would be fabricating a number the pipeline never produced. So the
 * weight is shown where one genuinely exists and omitted where it does not,
 * and every agent still shows its own confidence.
 */
export const AGENT_FACTOR: Record<string, keyof FactorWeights | null> = {
  MARKET_INTELLIGENCE: "competitorPressure",
  DEMAND_FORECASTING: "demandSignal",
  INVENTORY_COST: "inventoryPosition",
  // Strategy owns the trade-off between the three above and the floor, which
  // is what marginProtection measures.
  PRICING_STRATEGY: "marginProtection",
  // Compliance does not weigh anything: it checks rules that were computed in
  // code, and may only tighten the outcome.
  EXECUTION_COMPLIANCE: null,
};

export function agentSummary(run: AgentRunDto): string {
  const output = (run.output as Record<string, unknown> | null) ?? null;
  if (run.error) return `Did not complete: ${run.error}`;
  const notes = output?.["notes"];
  if (typeof notes === "string" && notes.length > 0) return notes;
  const rationale = output?.["rationale"];
  if (typeof rationale === "string" && rationale.length > 0) return rationale;
  const decision = output?.["decision"];
  if (typeof decision === "string") {
    return decision === "allow"
      ? "No rule violations. The price is inside the permitted range."
      : `Compliance returned "${decision}".`;
  }
  return "No summary reported.";
}
