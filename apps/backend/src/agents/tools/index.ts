import { z } from "zod";
import * as productRepo from "../../repositories/product.repository";
import { floorPrice } from "../../services/businessRules";
import { defineTool, type ToolDefinition } from "../types";

// Every tool receives ToolContext, which carries orgId. A tool physically
// cannot read another tenant's data, because the repository call underneath
// requires the scoped id, the tenancy guarantee is structural, not a check.
//
// Tools return { available: false, reason } on missing data rather than
// throwing, so the model can reason about the gap explicitly instead of the
// pipeline dying (PRD requirement AI-8).

const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- market

const CompetitorArgs = z.object({ lookbackDays: z.number().int().min(1).max(90) });

export const getCompetitorPrices: ToolDefinition<z.infer<typeof CompetitorArgs>> = {
  name: "get_competitor_prices",
  source: { label: "CompetitorPrice table, synthetic scrape feed", kind: "internal_db" },
  description:
    "Fetch recent competitor prices for the product under analysis. Returns each " +
    "competitor's latest price, the age of that observation in days, and summary " +
    "statistics. Call this when you need to know what the market is charging.",
  parameters: {
    type: "object",
    properties: {
      lookbackDays: {
        type: "number",
        description:
          "How many days of competitor observations to consider. Use 7 for current market state, 30 for trend analysis.",
        minimum: 1,
        maximum: 90,
      },
    },
    required: ["lookbackDays"],
  },
  argsSchema: CompetitorArgs,

  async execute({ lookbackDays }, ctx) {
    const product = await productRepo.findById(ctx.orgId, ctx.productId);
    if (!product) return { available: false, reason: "Product not found" };

    const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);
    const rows = product.competitorPrices.filter((c) => c.scrapedAt >= cutoff);

    if (rows.length === 0) {
      return {
        available: false,
        reason: `No competitor observations in the last ${lookbackDays} days`,
      };
    }

    // Latest observation per competitor.
    const latest = new Map<string, { price: number; scrapedAt: Date }>();
    for (const row of rows) {
      const existing = latest.get(row.competitor);
      if (!existing || row.scrapedAt > existing.scrapedAt) {
        latest.set(row.competitor, { price: Number(row.price), scrapedAt: row.scrapedAt });
      }
    }

    const competitors = [...latest.entries()].map(([name, v]) => ({
      name,
      price: round2(v.price),
      ageDays: daysSince(v.scrapedAt),
    }));
    const prices = competitors.map((c) => c.price);

    return {
      available: true,
      observationCount: rows.length,
      competitors,
      summary: {
        min: round2(Math.min(...prices)),
        median: round2(median(prices)),
        max: round2(Math.max(...prices)),
        oldestObservationDays: Math.max(...competitors.map((c) => c.ageDays)),
      },
    };
  },
};

const HistoryArgs = z.object({ days: z.number().int().min(7).max(90) });

export const getPriceHistory: ToolDefinition<z.infer<typeof HistoryArgs>> = {
  name: "get_price_history",
  source: { label: "CompetitorPrice table, bucketed weekly", kind: "internal_db" },
  description:
    "Fetch the competitor price series over time, bucketed by week, so a trend " +
    "direction can be judged rather than a single snapshot. Call this only when " +
    "you need to know whether prices are moving, not merely where they are now.",
  parameters: {
    type: "object",
    properties: {
      days: {
        type: "number",
        description: "How many days of history to summarise. 30 is typical.",
        minimum: 7,
        maximum: 90,
      },
    },
    required: ["days"],
  },
  argsSchema: HistoryArgs,

  async execute({ days }, ctx) {
    const product = await productRepo.findById(ctx.orgId, ctx.productId);
    if (!product) return { available: false, reason: "Product not found" };

    const cutoff = new Date(Date.now() - days * 86_400_000);
    const rows = product.competitorPrices.filter((c) => c.scrapedAt >= cutoff);
    if (rows.length === 0) return { available: false, reason: "No price history in that window" };

    const buckets = new Map<number, number[]>();
    for (const row of rows) {
      const week = Math.floor(daysSince(row.scrapedAt) / 7);
      const bucket = buckets.get(week) ?? [];
      bucket.push(Number(row.price));
      buckets.set(week, bucket);
    }

    const series = [...buckets.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([weeksAgo, values]) => ({ weeksAgo, medianPrice: round2(median(values)) }));

    return { available: true, series };
  },
};

// ------------------------------------------------------------- inventory

const InventoryArgs = z.object({});

export const getInventoryAndCost: ToolDefinition<z.infer<typeof InventoryArgs>> = {
  name: "get_inventory_and_cost",
  source: { label: "Product table, cost and stock of record", kind: "internal_db" },
  description:
    "Fetch stock level, unit cost, the configured margin floor, and the resulting " +
    "absolute floor price for the product under analysis. The floor price is " +
    "computed by the system, use it, do not recalculate it.",
  parameters: { type: "object", properties: {}, required: [] },
  argsSchema: InventoryArgs,

  async execute(_args, ctx) {
    const product = await productRepo.findById(ctx.orgId, ctx.productId);
    if (!product) return { available: false, reason: "Product not found" };

    const cost = Number(product.cost);
    // Demand signals are not part of the product include, so they are fetched
    // explicitly rather than widening every product read for one caller.
    const signals = await productRepo.latestDemandSignals(ctx.productId, 6);
    const velocity = signals.find((s) => s.signalType === "SKU_VELOCITY")?.value ?? 1;
    // Units per day, floored at a small positive number so days-of-cover cannot
    // divide by zero on a brand-new SKU.
    const dailyVelocity = Math.max(velocity * 2, 0.1);

    return {
      available: true,
      inventoryLevel: product.inventoryLevel,
      inventoryStatus: product.inventoryStatus,
      unitCost: round2(cost),
      marginFloorPct: product.marginFloorPct,
      // Computed in TypeScript and handed over. An LLM arithmetic slip here is
      // the one error that could cause a below-cost sale (rule R8).
      absoluteFloorPrice: floorPrice(cost, product.marginFloorPct),
      daysOfCover: Math.round(product.inventoryLevel / dailyVelocity),
    };
  },
};

// ---------------------------------------------------------------- demand

const DemandArgs = z.object({ days: z.number().int().min(7).max(90) });

export const getDemandTrends: ToolDefinition<z.infer<typeof DemandArgs>> = {
  name: "get_demand_trends",
  source: { label: "DemandSignal table, seasonality and velocity", kind: "internal_db" },
  description:
    "Fetch demand signals for the product: sales velocity, a seasonal index, and " +
    "the category's elasticity anchor. Call this to ground an elasticity estimate " +
    "in observed data rather than guessing a magnitude.",
  parameters: {
    type: "object",
    properties: {
      days: { type: "number", description: "Observation window in days.", minimum: 7, maximum: 90 },
    },
    required: ["days"],
  },
  argsSchema: DemandArgs,

  async execute({ days }, ctx) {
    const signals = await productRepo.latestDemandSignals(ctx.productId, 12);
    if (signals.length === 0) return { available: false, reason: "No demand signals recorded" };

    const byType = (type: string) => signals.find((s) => s.signalType === type)?.value ?? null;

    return {
      available: true,
      windowDays: days,
      skuVelocity: byType("SKU_VELOCITY"),
      seasonalIndex: byType("SEASONAL"),
      categoryElasticityAnchor: byType("CATEGORY_TREND"),
      observationCount: signals.length,
    };
  },
};

// Each agent is given only the tools its responsibility requires. The Market
// Intelligence agent has no inventory tool, so it physically cannot reason from
// stock levels even if its prompt were ignored (PRD requirement AI-2).
export const MARKET_TOOLS = [defineTool(getCompetitorPrices), defineTool(getPriceHistory)];
export const INVENTORY_TOOLS = [defineTool(getInventoryAndCost)];
export const DEMAND_TOOLS = [defineTool(getDemandTrends)];
