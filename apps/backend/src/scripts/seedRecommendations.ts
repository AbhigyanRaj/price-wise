import type {
  DemandOutput,
  InventoryOutput,
  MarketIntelOutput,
  StrategyOutput,
} from "@pricewise/shared";
import { computeConfidence } from "../agents/confidence";
import type { JsonValue } from "../lib/json";
import type { SeedRecommendationInput } from "../repositories/seed.repository";
import type { GeneratedProduct } from "./generateSyntheticData";
import { createRng, round2 } from "./random";

// Pre-computed recommendations with a full five-agent trail. These exist so the
// queue, the detail view and the whole explainability surface are populated on
// first login without spending an LLM call, and so a demo still works if Groq
// is rate-limited or down. The numbers are internally consistent: the trail
// actually supports the recommendation it sits under.

const FAST_MODEL = "openai/gpt-oss-20b";
const STRONG_MODEL = "openai/gpt-oss-120b";

type Status = SeedRecommendationInput["status"];

/** Mirrors the real distribution an analyst would find on a Monday morning. */
// The intended mix of outcomes, so the queue, the history and the audit trail
// are all populated on first login. AUTO_EXECUTED is a *request*, not a
// guarantee: a row only keeps it if the confidence the real function computed
// actually clears the organization's threshold. See resolveStatus below.
const STATUS_PLAN: Status[] = [
  "PENDING", "PENDING", "PENDING", "PENDING", "PENDING",
  "APPROVED", "APPROVED", "APPROVED",
  "AUTO_EXECUTED", "AUTO_EXECUTED",
  "REJECTED",
  "MODIFIED",
];

/**
 * Keeps the seeded status honest against the seeded confidence.
 *
 * Nothing may claim to have auto-executed below the threshold that governs
 * auto-execution, and nothing sitting well above it should still be waiting on
 * a human for no stated reason. A reviewer who opens a seeded row and compares
 * the badge against the waterfall must not find them contradicting each other.
 */
function resolveStatus(intended: Status, confidence: number, threshold: number): Status {
  if (intended === "AUTO_EXECUTED" && confidence < threshold) return "APPROVED";
  if (intended === "PENDING" && confidence >= threshold) return "AUTO_EXECUTED";
  return intended;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * The four agent outputs, typed rather than cast straight to JSON.
 *
 * Typed on purpose: these are the exact objects the real pipeline hands to
 * computeConfidence(), so the seeded confidence score is produced by the same
 * function that produces a live one. The previous version re-implemented the
 * weighted mean and two of the penalties inline, which meant the seed could
 * silently drift away from the code it was pretending to be the output of.
 */
function deriveOutputs(
  product: GeneratedProduct,
  competitorMedian: number,
  recommendedPrice: number,
  floorPrice: number,
  confidences: { market: number; inventory: number; demand: number; strategy: number },
  trend: "rising" | "falling" | "stable",
  daysOfCover: number,
) {
  const prices = product.competitorPrices.map((c) => c.price);
  // Age of the FRESHEST observation, not the oldest.
  //
  // get_competitor_prices filters to a lookback window and reports the most
  // recent price per competitor, so a live agent sees a small number here
  // unless the feed has genuinely gone quiet. Taking the max instead meant the
  // seed reported the age of the oldest row in a 30-day history, so every
  // product looked stale and every seeded recommendation took the -0.15
  // penalty. That is why seeded confidence sat a full step below live output.
  const freshestDays = Math.min(
    ...product.competitorPrices.map((c) =>
      Math.floor((Date.now() - c.scrapedAt.getTime()) / 86_400_000),
    ),
  );

  const market: MarketIntelOutput = {
    competitorMin: round2(Math.min(...prices)),
    competitorMedian: round2(competitorMedian),
    competitorMax: round2(Math.max(...prices)),
    trend,
    newEntrants: [],
    dataAgeDays: freshestDays,
    notes: `Our price of ${product.currentPrice.toFixed(2)} sits ${
      product.currentPrice > competitorMedian ? "above" : "below"
    } the competitor median of ${competitorMedian.toFixed(2)}. Trend over the observation window is ${trend}.`,
    confidence: confidences.market,
  };

  const inventory: InventoryOutput = {
    stockStatus: product.inventoryStatus,
    daysOfCover,
    unitCost: product.cost,
    // Computed in code and echoed, never derived by the model (rule R8).
    absoluteFloorPrice: floorPrice,
    constraints:
      daysOfCover < 14
        ? ["Scarcity: under 14 days of cover"]
        : daysOfCover > 120
          ? ["Overstock: more than 120 days of cover"]
          : [],
    notes: `Unit cost ${product.cost.toFixed(2)} against a ${(product.marginFloorPct * 100).toFixed(1)}% floor gives an absolute floor price of ${floorPrice.toFixed(2)}.`,
    confidence: confidences.inventory,
  };

  const demand: DemandOutput = {
    elasticity: product.demandSignals.find((s) => s.signalType === "CATEGORY_TREND")?.value ?? -1.5,
    seasonalIndex: product.demandSignals.find((s) => s.signalType === "SEASONAL")?.value ?? 1,
    velocityTrend:
      (product.demandSignals.find((s) => s.signalType === "SKU_VELOCITY")?.value ?? 1) > 1.5
        ? "accelerating"
        : "steady",
    projectedUnitDeltaPct: round2(((product.currentPrice - recommendedPrice) / product.currentPrice) * 180),
    notes: "Elasticity anchored on the category, adjusted for observed velocity.",
    confidence: confidences.demand,
  };

  const strategy: StrategyOutput = {
    recommendedPrice,
    direction:
      recommendedPrice > product.currentPrice
        ? "increase"
        : recommendedPrice < product.currentPrice
          ? "decrease"
          : "hold",
    rationale: "See recommendation rationale.",
    factorWeights: {
      competitorPressure: 0.45,
      demandSignal: 0.2,
      inventoryPosition: 0.2,
      marginProtection: 0.15,
    },
    confidence: confidences.strategy,
  };

  return { market, inventory, demand, strategy };
}

function buildAgentRuns(
  product: GeneratedProduct,
  outputs: ReturnType<typeof deriveOutputs>,
  competitorMedian: number,
  recommendedPrice: number,
  floorPrice: number,
): SeedRecommendationInput["agentRuns"] {
  const promptBase = { sku: product.sku, category: product.category };
  const { market, inventory, demand, strategy } = outputs;

  return [
    {
      agentName: "MARKET_INTELLIGENCE",
      input: { ...promptBase, currentPrice: product.currentPrice } as JsonValue,
      output: market as unknown as JsonValue,
      toolCalls: [
        { name: "get_competitor_prices", args: { lookbackDays: 7 }, durationMs: 4 },
        { name: "get_price_history", args: { days: 30 }, durationMs: 6 },
      ] as JsonValue,
      confidence: market.confidence,
      model: FAST_MODEL,
      promptTokens: 1240,
      completionTokens: 318,
      durationMs: 1840,
    },
    {
      agentName: "INVENTORY_COST",
      input: { ...promptBase, cost: product.cost, marginFloorPct: product.marginFloorPct } as JsonValue,
      output: inventory as unknown as JsonValue,
      toolCalls: [{ name: "get_inventory_and_cost", args: {}, durationMs: 3 }] as JsonValue,
      confidence: inventory.confidence,
      model: FAST_MODEL,
      promptTokens: 890,
      completionTokens: 276,
      durationMs: 1120,
    },
    {
      agentName: "DEMAND_FORECASTING",
      input: { ...promptBase, upstreamConfidence: market.confidence } as JsonValue,
      output: demand as unknown as JsonValue,
      toolCalls: [{ name: "get_demand_trends", args: { days: 30 }, durationMs: 3 }] as JsonValue,
      confidence: demand.confidence,
      model: FAST_MODEL,
      promptTokens: 1410,
      completionTokens: 344,
      durationMs: 1610,
    },
    {
      agentName: "PRICING_STRATEGY",
      input: { ...promptBase, floorPrice, competitorMedian } as JsonValue,
      output: strategy as unknown as JsonValue,
      // Pricing Strategy has no tools by design: it is pure synthesis, and
      // giving it tools would let it re-fetch and contradict the specialists.
      toolCalls: [] as JsonValue,
      confidence: strategy.confidence,
      model: STRONG_MODEL,
      promptTokens: 2180,
      completionTokens: 486,
      durationMs: 2940,
    },
    {
      agentName: "EXECUTION_COMPLIANCE",
      input: { ...promptBase, proposedPrice: recommendedPrice, floorPrice } as JsonValue,
      output: {
        decision: recommendedPrice < floorPrice ? "adjust" : "allow",
        finalPrice: Math.max(recommendedPrice, floorPrice),
        violations:
          recommendedPrice < floorPrice
            ? [{ rule: "MARGIN_FLOOR", detail: "Proposed price is below the category margin floor" }]
            : [],
        notes:
          recommendedPrice < floorPrice
            ? "MARGIN_FLOOR bound the outcome; the competitively-indicated price is below our cost structure."
            : "No violations. Price is within the permitted range and above the margin floor.",
      } as JsonValue,
      toolCalls: [] as JsonValue,
      // Compliance reports no confidence of its own: it is a rule check, and
      // the number it would report is not an input to computeConfidence().
      confidence: null,
      model: STRONG_MODEL,
      promptTokens: 1120,
      completionTokens: 238,
      durationMs: 1380,
    },
  ];
}

export function buildRecommendations(
  products: { id: string; generated: GeneratedProduct }[],
  users: { adminId: string; analystId: string },
  seed: number,
  confidenceThreshold: number,
): SeedRecommendationInput[] {
  const rng = createRng(seed);
  const out: SeedRecommendationInput[] = [];

  // Prefer the planted scenarios first so they always have a recommendation
  // waiting, then fill the rest of the queue from the catalog.
  const ordered = [...products].sort((a, b) => {
    const aPlanted = a.generated.scenarioLabel ? 0 : 1;
    const bPlanted = b.generated.scenarioLabel ? 0 : 1;
    return aPlanted - bPlanted;
  });

  STATUS_PLAN.forEach((intendedStatus, i) => {
    const entry = ordered[i];
    if (!entry) return;

    const product = entry.generated;
    const prices = product.competitorPrices.map((c) => c.price);
    if (prices.length === 0) return;

    const competitorMedian = median(prices);
    const floorPrice = round2(product.cost / (1 - product.marginFloorPct));

    // Move part-way toward the competitor median, then respect the floor, the
    // same shape the real strategy agent produces.
    const indicated = product.currentPrice + (competitorMedian - product.currentPrice) * rng.between(0.4, 0.8);
    const recommendedPrice = round2(Math.max(indicated, floorPrice));

    // Ranges chosen from what the live agents actually self-report, sampled
    // over 13 real pipeline runs: market and inventory cluster around 0.85 to
    // 0.90, demand runs lower, strategy sits between. These feed the real
    // computeConfidence() below, so the resulting distribution matches live
    // output (observed median 0.77) rather than being tuned independently.
    const confidences = {
      market: round2(rng.between(0.68, 0.95)),
      inventory: round2(rng.between(0.75, 0.95)),
      demand: round2(rng.between(0.6, 0.9)),
      strategy: round2(rng.between(0.68, 0.93)),
    };

    const trend: "rising" | "falling" = competitorMedian < product.currentPrice ? "falling" : "rising";
    // Derived from the product's actual inventory status rather than a free
    // random divisor. The old version divided stock by 2 to 8, which put most
    // products outside the 14 to 120 day band and fired the inventory-constraint
    // penalty on nearly every row. Live runs only take that penalty when the
    // product genuinely has a stock problem, and the seed should behave the
    // same way or it misrepresents how often confidence gets docked.
    const daysOfCover =
      product.inventoryStatus === "LOW"
        ? Math.round(rng.between(4, 13))
        : product.inventoryStatus === "OVERSTOCKED"
          ? Math.round(rng.between(125, 200))
          : Math.round(rng.between(20, 90));

    const outputs = deriveOutputs(
      product,
      competitorMedian,
      recommendedPrice,
      floorPrice,
      confidences,
      trend,
      daysOfCover,
    );

    // The real function, not a copy of it. Whatever penalties the live pipeline
    // would apply to these inputs, the seed applies too, so a reviewer reading a
    // seeded breakdown is reading something the system could actually produce.
    const breakdown = computeConfidence({
      market: outputs.market,
      demand: outputs.demand,
      inventory: outputs.inventory,
      strategy: outputs.strategy,
      priceDeltaPct: (recommendedPrice - product.currentPrice) / product.currentPrice,
      failedAgents: [],
    });
    const confidenceScore = breakdown.final;

    const direction = recommendedPrice < product.currentPrice ? "decrease" : "increase";
    const rationale =
      `Competitor median is ${competitorMedian.toFixed(2)} against our ${product.currentPrice.toFixed(2)}, ` +
      `a gap of ${(((competitorMedian - product.currentPrice) / product.currentPrice) * 100).toFixed(1)}%. ` +
      `Inventory is ${product.inventoryStatus.toLowerCase()} at ${product.inventoryLevel} units. ` +
      `A ${direction} to ${recommendedPrice.toFixed(2)} closes most of the competitive gap while holding ` +
      `margin above the ${floorPrice.toFixed(2)} floor.`;

    const status = resolveStatus(intendedStatus, confidenceScore, confidenceThreshold);
    const resolved = status !== "PENDING";
    const createdAt = daysAgo(rng.int(0, 6));

    out.push({
      productId: entry.id,
      recommendedPrice,
      currentPriceAtTime: product.currentPrice,
      confidenceScore,
      rationale,
      factorWeights: {
        competitorPressure: 0.45,
        demandSignal: 0.2,
        inventoryPosition: 0.2,
        marginProtection: 0.15,
        // The breakdown the UI renders as a waterfall.
        confidenceBreakdown: breakdown,
      } as unknown as JsonValue,
      status,
      // AUTO_EXECUTED has a null actor: that is how the audit trail
      // distinguishes a system action from a human one (FR-AUD-8).
      resolvedByUserId: status === "AUTO_EXECUTED" ? null : resolved ? users.analystId : null,
      resolvedAt: resolved ? new Date(createdAt.getTime() + 3_600_000) : null,
      rejectionReason:
        status === "REJECTED"
          ? "Bundle promotion launches Thursday; cutting the standalone price now undermines it."
          : null,
      modifiedPrice: status === "MODIFIED" ? round2(recommendedPrice * 1.04) : null,
      createdAt,
      agentRuns: buildAgentRuns(product, outputs, competitorMedian, recommendedPrice, floorPrice),
    });
  });

  return out;
}
