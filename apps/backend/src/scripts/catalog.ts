import type { Role } from "@pricewise/shared";

// Category profiles drive generation so the catalog is not uniform noise.
// This matters for the agents: electronics get thin margins and high
// volatility, beauty gets fat margins and stability, so the margin floor
// actually binds in some categories and not others, and the demo can show a
// range of agent behaviour rather than "drop the price" five times.
export interface CategoryProfile {
  priceRange: [number, number];
  marginRange: [number, number];
  volatility: number;
  /** Elasticity anchor, used when seeding demand signals. */
  elasticity: number;
}

export const CATEGORY_PROFILES: Record<string, CategoryProfile> = {
  Electronics: { priceRange: [49, 1899], marginRange: [0.12, 0.28], volatility: 0.08, elasticity: -2.4 },
  "Home & Kitchen": { priceRange: [15, 399], marginRange: [0.25, 0.48], volatility: 0.04, elasticity: -1.6 },
  Apparel: { priceRange: [12, 189], marginRange: [0.35, 0.62], volatility: 0.06, elasticity: -1.4 },
  Outdoor: { priceRange: [25, 899], marginRange: [0.22, 0.45], volatility: 0.05, elasticity: -1.8 },
  Beauty: { priceRange: [8, 129], marginRange: [0.4, 0.7], volatility: 0.03, elasticity: -0.9 },
};

export const COMPETITORS = ["SoundHub", "AudioMart", "BassLine", "ValueRange", "PrimeGoods"];

/** Documented in the README so an evaluator can log in immediately. */
export const SEED_PASSWORD = "Pricewise2026!";

export interface SeedUser {
  email: string;
  name: string;
  role: Role;
}

export interface SeedOrg {
  name: string;
  slug: string;
  confidenceThreshold: number;
  maxPriceDeltaPct: number;
  users: SeedUser[];
  categories: string[];
  skuCount: number;
}

// Two organizations with zero SKU overlap and different thresholds, so tenant
// isolation is visible on sight and identical market conditions produce
// different auto-execution behaviour between tenants.
export const ORGS: SeedOrg[] = [
  {
    name: "Northwind Retail",
    slug: "NW",
    confidenceThreshold: 0.8,
    maxPriceDeltaPct: 0.2,
    users: [
      { email: "admin@northwind.test", name: "Ada Admin", role: "ADMIN" },
      { email: "analyst@northwind.test", name: "Alan Analyst", role: "PRICING_ANALYST" },
    ],
    categories: ["Electronics", "Home & Kitchen", "Apparel"],
    skuCount: 28,
  },
  {
    name: "Meridian Goods",
    slug: "MG",
    // Deliberately lower: the same recommendation auto-executes here and goes
    // to a human at Northwind. That contrast is the tenancy demo.
    confidenceThreshold: 0.75,
    maxPriceDeltaPct: 0.25,
    users: [
      { email: "admin@meridian.test", name: "Maya Admin", role: "ADMIN" },
      { email: "analyst@meridian.test", name: "Marco Analyst", role: "PRICING_ANALYST" },
    ],
    categories: ["Electronics", "Outdoor", "Beauty"],
    skuCount: 26,
  },
];

const PRODUCT_NAMES: Record<string, string[]> = {
  Electronics: [
    "Noise-Cancelling Headphones", "Wireless Earbuds", "4K Monitor", "Mechanical Keyboard",
    "Portable SSD", "Bluetooth Speaker", "Webcam Pro", "USB-C Hub", "Smart Watch",
    "Action Camera", "Tablet Stand", "Gaming Mouse",
  ],
  "Home & Kitchen": [
    "Electric Kettle", "Cast Iron Skillet", "Espresso Machine", "Air Fryer", "Knife Block Set",
    "Stand Mixer", "Vacuum Flask", "Ceramic Dinner Set", "Blender", "Toaster",
  ],
  Apparel: [
    "Merino Wool Scarf", "Rain Shell Jacket", "Oxford Shirt", "Chino Trousers", "Leather Belt",
    "Cashmere Jumper", "Running Shorts", "Canvas Tote",
  ],
  Outdoor: [
    "Alpine Tent", "Trekking Poles", "Down Sleeping Bag", "Camping Stove", "Head Torch",
    "Dry Bag", "Insulated Flask", "Trail Backpack", "Folding Chair",
  ],
  Beauty: [
    "Vitamin C Serum", "Hydrating Cleanser", "Retinol Night Cream", "Lip Balm Trio",
    "Mineral Sunscreen", "Clay Mask", "Hair Oil", "Exfoliating Toner",
  ],
};

const CATEGORY_CODES: Record<string, string> = {
  Electronics: "ELEC",
  "Home & Kitchen": "HOME",
  Apparel: "APPA",
  Outdoor: "OUTD",
  Beauty: "BEAU",
};

export function productNamesFor(category: string): string[] {
  return PRODUCT_NAMES[category] ?? [];
}

export function skuFor(orgSlug: string, category: string, ordinal: number): string {
  const code = CATEGORY_CODES[category] ?? "MISC";
  return `${orgSlug}-${code}-${String(ordinal).padStart(4, "0")}`;
}

/**
 * The highest ordinal any planted scenario needs from this org+category.
 *
 * Numbering restarts per category (NW-APPA-0003 is the third *apparel* item,
 * not the third product overall), so a category must generate at least as many
 * products as its highest planted ordinal or the scenario SKU silently will not
 * exist, which is exactly the bug this function prevents.
 */
export function highestPlantedOrdinal(orgSlug: string, category: string): number {
  const prefix = `${orgSlug}-${CATEGORY_CODES[category] ?? "MISC"}-`;
  return PLANTED_SCENARIOS.filter((s) => s.sku.startsWith(prefix)).reduce(
    (max, s) => Math.max(max, Number(s.sku.slice(prefix.length))),
    0,
  );
}

/**
 * The five planted scenarios. These are the reason the demo is good: each SKU
 * is deliberately placed in a state that exercises a specific code path, so the
 * interview can say "watch what the compliance agent does with this one"
 * instead of clicking around hoping something interesting happens.
 *
 * Documented in the README (PRD requirement D-12).
 */
export interface PlantedScenario {
  sku: string;
  label: string;
  expectation: string;
  /** Applied after normal generation, overriding whatever it produced. */
  mutate: (p: { currentPrice: number; cost: number }) => {
    currentPrice?: number;
    cost?: number;
    inventoryLevel?: number;
    /** Competitor prices are set to this fraction of our current price. */
    competitorFactor?: number;
    /** Oldest competitor observation is forced this many days old. */
    competitorAgeDays?: number;
    /** Multiplier applied to seeded demand velocity. */
    demandMultiplier?: number;
  };
}

export const PLANTED_SCENARIOS: PlantedScenario[] = [
  {
    sku: "NW-ELEC-0007",
    label: "Aggressive competitor undercut",
    expectation: "Strong decrease, high confidence, likely auto-executes",
    mutate: () => ({ competitorFactor: 0.85, inventoryLevel: 480 }),
  },
  {
    sku: "NW-HOME-0012",
    label: "Margin floor blocks the obvious move",
    // Competitors have gone below our cost. The commercially "correct" move is
    // impossible, and the compliance agent has to say so.
    expectation: "Compliance ADJUSTS to the floor; margin protection visible",
    mutate: (p) => ({ competitorFactor: 0.78, cost: round(p.currentPrice * 0.88) }),
  },
  {
    sku: "NW-APPA-0003",
    label: "Demand surge with low stock",
    expectation: "Price INCREASE, scarcity plus demand",
    mutate: () => ({ inventoryLevel: 11, demandMultiplier: 2.4 }),
  },
  {
    sku: "MG-OUTD-0005",
    label: "Stale competitor data",
    expectation: "Confidence penalty routes it to a human despite a clear direction",
    mutate: () => ({ competitorAgeDays: 19 }),
  },
  {
    sku: "MG-BEAU-0009",
    label: "Conflicting signals",
    expectation: "Market says falling, demand says accelerating, disagreement penalty fires",
    mutate: () => ({ competitorFactor: 0.9, demandMultiplier: 1.8 }),
  },
];

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
