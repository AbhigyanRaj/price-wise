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
const STATUS_PLAN: Status[] = [
  "PENDING", "PENDING", "PENDING", "PENDING", "PENDING",
  "APPROVED", "APPROVED", "APPROVED",
  "AUTO_EXECUTED", "AUTO_EXECUTED",
  "REJECTED",
  "MODIFIED",
];

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

function buildAgentRuns(
  product: GeneratedProduct,
  competitorMedian: number,
  recommendedPrice: number,
  floorPrice: number,
  confidences: { market: number; inventory: number; demand: number; strategy: number },
  trend: "rising" | "falling" | "stable",
  daysOfCover: number,
): SeedRecommendationInput["agentRuns"] {
  const prices = product.competitorPrices.map((c) => c.price);
  const oldestDays = Math.max(
    ...product.competitorPrices.map((c) =>
      Math.floor((Date.now() - c.scrapedAt.getTime()) / 86_400_000),
    ),
    0,
  );

  const promptBase = { sku: product.sku, category: product.category };

  return [
    {
      agentName: "MARKET_INTELLIGENCE",
      input: { ...promptBase, currentPrice: product.currentPrice } as JsonValue,
      output: {
        competitorMin: round2(Math.min(...prices)),
        competitorMedian: round2(competitorMedian),
        competitorMax: round2(Math.max(...prices)),
        trend,
        newEntrants: [],
        dataAgeDays: oldestDays,
        notes: `Our price of ${product.currentPrice.toFixed(2)} sits ${
          product.currentPrice > competitorMedian ? "above" : "below"
        } the competitor median of ${competitorMedian.toFixed(2)}. Trend over the observation window is ${trend}.`,
        confidence: confidences.market,
      } as JsonValue,
      toolCalls: [
        { name: "get_competitor_prices", args: { lookbackDays: 7 }, durationMs: 4 },
        { name: "get_price_history", args: { days: 30 }, durationMs: 6 },
      ] as JsonValue,
      confidence: confidences.market,
      model: FAST_MODEL,
      promptTokens: 1240,
      completionTokens: 318,
      durationMs: 1840,
    },
    {
      agentName: "INVENTORY_COST",
      input: { ...promptBase, cost: product.cost, marginFloorPct: product.marginFloorPct } as JsonValue,
      output: {
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
      } as JsonValue,
      toolCalls: [
        { name: "get_inventory_and_cost", args: {}, durationMs: 3 },
      ] as JsonValue,
      confidence: confidences.inventory,
      model: FAST_MODEL,
      promptTokens: 890,
      completionTokens: 276,
      durationMs: 1120,
    },
    {
      agentName: "DEMAND_FORECASTING",
      input: { ...promptBase, upstreamConfidence: confidences.market } as JsonValue,
      output: {
        elasticity: product.demandSignals.find((s) => s.signalType === "CATEGORY_TREND")?.value ?? -1.5,
        seasonalIndex: product.demandSignals.find((s) => s.signalType === "SEASONAL")?.value ?? 1,
        velocityTrend:
          (product.demandSignals.find((s) => s.signalType === "SKU_VELOCITY")?.value ?? 1) > 1.5
            ? "accelerating"
            : "steady",
        projectedUnitDeltaPct: round2(((product.currentPrice - recommendedPrice) / product.currentPrice) * 180),
        notes: "Elasticity anchored on the category, adjusted for observed velocity.",
        confidence: confidences.demand,
      } as JsonValue,
      toolCalls: [{ name: "get_demand_trends", args: { days: 30 }, durationMs: 3 }] as JsonValue,
      confidence: confidences.demand,
      model: FAST_MODEL,
      promptTokens: 1410,
      completionTokens: 344,
      durationMs: 1610,
    },
    {
      agentName: "PRICING_STRATEGY",
      input: { ...promptBase, floorPrice, competitorMedian } as JsonValue,
      output: {
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
      } as JsonValue,
      // Pricing Strategy has no tools by design: it is pure synthesis, and
      // giving it tools would let it re-fetch and contradict the specialists.
      toolCalls: [] as JsonValue,
      confidence: confidences.strategy,
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
      confidence: 0.9,
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

  STATUS_PLAN.forEach((status, i) => {
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

    const confidences = {
      market: round2(rng.between(0.72, 0.95)),
      inventory: round2(rng.between(0.8, 0.96)),
      demand: round2(rng.between(0.6, 0.9)),
      strategy: round2(rng.between(0.7, 0.92)),
    };

    const base =
      confidences.market * 0.3 +
      confidences.demand * 0.25 +
      confidences.inventory * 0.25 +
      confidences.strategy * 0.2;

    const deltaPct = Math.abs(recommendedPrice - product.currentPrice) / product.currentPrice;
    const penalties: { reason: string; amount: number }[] = [];
    if (deltaPct > 0.15) {
      penalties.push({ reason: `Large price change (${(deltaPct * 100).toFixed(1)}%)`, amount: 0.1 });
    }
    if (product.inventoryStatus !== "NORMAL") {
      penalties.push({ reason: "1 inventory constraint active", amount: 0.05 });
    }

    const totalPenalty = Math.min(
      penalties.reduce((s, p) => s + p.amount, 0),
      0.45,
    );
    const confidenceScore = round2(Math.max(0, Math.min(1, base - totalPenalty)));

    const direction = recommendedPrice < product.currentPrice ? "decrease" : "increase";
    const rationale =
      `Competitor median is ${competitorMedian.toFixed(2)} against our ${product.currentPrice.toFixed(2)}, ` +
      `a gap of ${(((competitorMedian - product.currentPrice) / product.currentPrice) * 100).toFixed(1)}%. ` +
      `Inventory is ${product.inventoryStatus.toLowerCase()} at ${product.inventoryLevel} units. ` +
      `A ${direction} to ${recommendedPrice.toFixed(2)} closes most of the competitive gap while holding ` +
      `margin above the ${floorPrice.toFixed(2)} floor.`;

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
        confidenceBreakdown: { base: round2(base), penalties, final: confidenceScore },
      } as JsonValue,
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
      agentRuns: buildAgentRuns(
        product,
        competitorMedian,
        recommendedPrice,
        floorPrice,
        confidences,
        competitorMedian < product.currentPrice ? "falling" : "rising",
        Math.round(product.inventoryLevel / rng.between(2, 8)),
      ),
    });
  });

  return out;
}
