import {
  CATEGORY_PROFILES,
  COMPETITORS,
  highestPlantedOrdinal,
  ORGS,
  PLANTED_SCENARIOS,
  productsFor,
  skuFor,
  type SeedOrg,
} from "./catalog";
import { createRng, round2, type Rng } from "./random";
import { deriveInventoryStatus } from "../services/product.service";
import type { InventoryStatus } from "@pricewise/shared";

export interface GeneratedProduct {
  sku: string;
  name: string;
  category: string;
  currentPrice: number;
  cost: number;
  marginFloorPct: number;
  inventoryLevel: number;
  inventoryStatus: InventoryStatus;
  competitorPrices: { competitor: string; price: number; scrapedAt: Date }[];
  demandSignals: { signalType: string; value: number; periodStart: Date; periodEnd: Date }[];
  /** Set when this SKU is one of the five planted demo scenarios. */
  scenarioLabel?: string;
}

const HISTORY_DAYS = 30;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * A mean-reverting random walk with occasional promotional shocks. Not a pure
 * random walk: without mean reversion a 30-day series wanders somewhere absurd,
 * and the competitor "market" stops looking like a market.
 */
function generateCompetitorSeries(
  rng: Rng,
  basePrice: number,
  volatility: number,
  oldestObservationDays: number,
): { price: number; scrapedAt: Date }[] {
  const series: { price: number; scrapedAt: Date }[] = [];
  let price = basePrice * rng.between(0.92, 1.08);

  for (let day = HISTORY_DAYS; day >= 0; day--) {
    price *= 1 + rng.normal(0, volatility / 4);

    // A competitor promotion: sharp drop, recovers over following days via the
    // mean reversion below.
    if (rng.chance(0.05)) price *= rng.between(0.85, 0.93);

    price += (basePrice - price) * 0.08;

    // Scenarios that need stale data shift every observation further back, so
    // the Market Intelligence agent genuinely sees old numbers rather than
    // being told they are old.
    series.push({ price: round2(price), scrapedAt: daysAgo(day + oldestObservationDays) });
  }

  return series;
}

function generateDemandSignals(
  rng: Rng,
  elasticity: number,
  multiplier: number,
): GeneratedProduct["demandSignals"] {
  const periodEnd = new Date();
  const periodStart = daysAgo(HISTORY_DAYS);

  return [
    {
      signalType: "SKU_VELOCITY",
      value: round2(rng.between(0.8, 1.3) * multiplier),
      periodStart,
      periodEnd,
    },
    {
      signalType: "SEASONAL",
      value: round2(rng.between(0.85, 1.25)),
      periodStart,
      periodEnd,
    },
    {
      signalType: "CATEGORY_TREND",
      // Stored as the category's elasticity anchor so the Demand agent has a
      // real number to reason from rather than inventing a magnitude.
      value: elasticity,
      periodStart,
      periodEnd,
    },
  ];
}

export function generateCatalog(org: SeedOrg, seed: number): GeneratedProduct[] {
  const rng = createRng(seed);
  const products: GeneratedProduct[] = [];

  // Even spread across the org's categories, so none is randomly starved.
  const evenSplit = Math.ceil(org.skuCount / org.categories.length);

  for (const category of org.categories) {
    const profile = CATEGORY_PROFILES[category];
    if (!profile) throw new Error(`No profile for category ${category}`);

    const catalogProducts = productsFor(category);

    // Generate at least enough for any planted scenario in this category. The
    // total may then slightly exceed skuCount, which is the right trade: a
    // missing demo SKU is a broken demo, a 29th product is nothing.
    const count = Math.max(evenSplit, highestPlantedOrdinal(org.slug, category));

    for (let i = 0; i < count; i++) {
      // Ordinal restarts per category.
      const sku = skuFor(org.slug, category, i + 1);
      const seed = catalogProducts[i % catalogProducts.length];
      const name = seed?.name ?? `${category} Item ${i + 1}`;

      // The product's own band, not the category's. See PRODUCTS in catalog.ts.
      const band = seed?.price ?? profile.priceRange;
      const currentPrice = round2(rng.between(band[0], band[1]));
      const margin = rng.between(profile.marginRange[0], profile.marginRange[1]);
      const cost = round2(currentPrice * (1 - margin));

      // Floor is set a little below the current margin, so most products have
      // headroom but a few do not, which is what makes the constraint real.
      const marginFloorPct = round2(Math.max(0.05, margin - rng.between(0.03, 0.12)));

      const base: GeneratedProduct = {
        sku,
        name,
        category,
        currentPrice,
        cost,
        marginFloorPct,
        inventoryLevel: rng.int(5, 520),
        inventoryStatus: "NORMAL",
        competitorPrices: [],
        demandSignals: [],
      };

      const scenario = PLANTED_SCENARIOS.find((s) => s.sku === sku);
      const overrides = scenario?.mutate({ currentPrice, cost }) ?? {};

      const finalPrice = overrides.currentPrice ?? base.currentPrice;
      const finalCost = overrides.cost ?? base.cost;
      const finalInventory = overrides.inventoryLevel ?? base.inventoryLevel;
      const competitorFactor = overrides.competitorFactor ?? 1;
      const competitorAge = overrides.competitorAgeDays ?? 0;
      const demandMultiplier = overrides.demandMultiplier ?? 1;

      const series = generateCompetitorSeries(
        rng,
        finalPrice * competitorFactor,
        profile.volatility,
        competitorAge,
      );

      // Each competitor observes a slightly different price on each day.
      const competitorPrices = COMPETITORS.slice(0, rng.int(3, 5)).flatMap((competitor) =>
        series
          // Keep the series sparse: a real scraper does not see every
          // competitor every day.
          .filter((_, dayIndex) => dayIndex % rng.int(2, 4) === 0)
          .map((point) => ({
            competitor,
            price: round2(point.price * rng.between(0.97, 1.03)),
            scrapedAt: point.scrapedAt,
          })),
      );

      products.push({
        ...base,
        currentPrice: finalPrice,
        cost: finalCost,
        inventoryLevel: finalInventory,
        inventoryStatus: deriveInventoryStatus(finalInventory),
        competitorPrices,
        demandSignals: generateDemandSignals(rng, profile.elasticity, demandMultiplier),
        ...(scenario ? { scenarioLabel: scenario.label } : {}),
      });
    }
  }

  return products;
}

export function generateAll(): { org: SeedOrg; products: GeneratedProduct[] }[] {
  // A fixed seed per organization: the same catalog every run, so a planted
  // scenario cannot drift and the README can name specific SKUs.
  return ORGS.map((org, i) => ({ org, products: generateCatalog(org, 1337 + i * 101) }));
}
