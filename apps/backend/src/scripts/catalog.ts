import type { Role } from "@pricewise/shared";

// Category profiles drive generation so the catalog is not uniform noise.
// This matters for the agents: electronics get thin margins and high
// volatility, beauty gets fat margins and stability, so the margin floor
// actually binds in some categories and not others, and the demo can show a
// range of agent behaviour rather than "drop the price" five times.
export interface CategoryProfile {
  /** Fallback only, for a category with no entry in PRODUCTS below. Real
   *  products price from their own band. */
  priceRange: [number, number];
  marginRange: [number, number];
  volatility: number;
  /** Elasticity anchor, used when seeding demand signals. */
  elasticity: number;
}

// Price ranges are rupees, at bands an Indian marketplace actually sells in,
// not a dollar figure multiplied by 85. Margins and elasticity are unchanged:
// thin and volatile in electronics, fat and stable in beauty, which is what
// makes the margin floor bind in some categories and not others.
export const CATEGORY_PROFILES: Record<string, CategoryProfile> = {
  Electronics: { priceRange: [999, 89999], marginRange: [0.12, 0.28], volatility: 0.08, elasticity: -2.4 },
  "Home & Kitchen": { priceRange: [499, 24999], marginRange: [0.25, 0.48], volatility: 0.04, elasticity: -1.6 },
  Apparel: { priceRange: [399, 12999], marginRange: [0.35, 0.62], volatility: 0.06, elasticity: -1.4 },
  Outdoor: { priceRange: [899, 44999], marginRange: [0.22, 0.45], volatility: 0.05, elasticity: -1.8 },
  Beauty: { priceRange: [249, 7999], marginRange: [0.4, 0.7], volatility: 0.03, elasticity: -0.9 },
};

// Invented marketplaces, deliberately. This is synthetic data in a public
// repository, and naming real Indian marketplaces would imply these are prices
// actually observed on them.
export const COMPETITORS = ["ShopKart", "DesiBazaar", "PriceWala", "MegaMart", "SwiftCart"];

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
    name: "Suvidha Retail",
    slug: "SR",
    confidenceThreshold: 0.8,
    maxPriceDeltaPct: 0.2,
    users: [
      { email: "admin@suvidha.test", name: "Ananya Rao", role: "ADMIN" },
      { email: "analyst@suvidha.test", name: "Rohan Mehta", role: "PRICING_ANALYST" },
    ],
    categories: ["Electronics", "Home & Kitchen", "Apparel"],
    skuCount: 28,
  },
  {
    name: "Bazaar Kart",
    slug: "BK",
    // Deliberately lower: the same recommendation auto-executes here and goes
    // to a human at Suvidha. That contrast is the tenancy demo.
    confidenceThreshold: 0.75,
    maxPriceDeltaPct: 0.25,
    users: [
      { email: "admin@bazaarkart.test", name: "Priya Nair", role: "ADMIN" },
      { email: "analyst@bazaarkart.test", name: "Vikram Shah", role: "PRICING_ANALYST" },
    ],
    categories: ["Electronics", "Outdoor", "Beauty"],
    skuCount: 26,
  },
];

/**
 * Each product carries its own price band, in rupees.
 *
 * A single category-wide range is what a generator reaches for first, and it
 * produces a catalogue nobody believes: drawing every Home & Kitchen item from
 * one 499 to 24,999 band priced a masala dabba at 15,389 and a wet grinder at
 * 702. The agents reason over competitor gaps and margins rather than absolute
 * prices, so the arithmetic was never wrong, but a reviewer who knows what
 * these things cost stops trusting the rest of the screen.
 */
interface CatalogProduct {
  name: string;
  price: [number, number];
}

const PRODUCTS: Record<string, CatalogProduct[]> = {
  Electronics: [
    { name: "Wireless Earbuds", price: [1499, 4999] },
    { name: "Power Bank 20000mAh", price: [1299, 2999] },
    { name: "Smart LED TV 43 inch", price: [22999, 38999] },
    { name: "Bluetooth Party Speaker", price: [3499, 9999] },
    { name: "Mechanical Keyboard", price: [2999, 7999] },
    { name: "Fast Charger 65W", price: [999, 2499] },
    { name: "Smart Watch", price: [1999, 6999] },
    { name: "Action Camera", price: [6999, 18999] },
    { name: "Gaming Mouse", price: [899, 3499] },
    { name: "Soundbar 2.1", price: [4999, 14999] },
    { name: "Room Air Purifier", price: [8999, 24999] },
    { name: "Tablet 10 inch", price: [11999, 24999] },
  ],
  "Home & Kitchen": [
    { name: "Mixer Grinder 750W", price: [2499, 5999] },
    { name: "Stainless Pressure Cooker", price: [1299, 3499] },
    { name: "Induction Cooktop", price: [1999, 4499] },
    { name: "Roti Maker", price: [1499, 3299] },
    { name: "Idli Steamer", price: [699, 1899] },
    { name: "Copper Water Bottle", price: [499, 1299] },
    { name: "Masala Dabba", price: [399, 999] },
    { name: "Non-stick Tawa", price: [499, 1499] },
    { name: "Electric Kettle", price: [799, 2299] },
    { name: "Casserole Set", price: [899, 2499] },
    { name: "Wet Grinder", price: [4999, 11999] },
    { name: "Steel Dinner Set", price: [1999, 5999] },
  ],
  Apparel: [
    { name: "Cotton Kurta", price: [699, 1999] },
    { name: "Banarasi Silk Saree", price: [3999, 12999] },
    { name: "Nehru Jacket", price: [1499, 3999] },
    { name: "Chikankari Dupatta", price: [899, 2499] },
    { name: "Kolhapuri Sandals", price: [799, 2199] },
    { name: "Linen Shirt", price: [1299, 2999] },
    { name: "Anarkali Suit Set", price: [1999, 5999] },
    { name: "Pashmina Shawl", price: [2499, 8999] },
    { name: "Cotton Palazzo", price: [499, 1299] },
    { name: "Block Print Kurti", price: [599, 1699] },
    { name: "Sherwani", price: [4999, 14999] },
    { name: "Leather Juttis", price: [899, 2499] },
  ],
  Outdoor: [
    { name: "Trekking Backpack 60L", price: [2499, 6999] },
    { name: "Dome Camping Tent", price: [2999, 9999] },
    { name: "Sleeping Bag", price: [1499, 4999] },
    { name: "Trekking Poles", price: [899, 2999] },
    { name: "Insulated Flask", price: [699, 1999] },
    { name: "Rechargeable Headlamp", price: [599, 1999] },
    { name: "Camping Stove", price: [1299, 3999] },
    { name: "Foldable Trek Chair", price: [899, 2499] },
    { name: "Rain Poncho", price: [399, 1199] },
    { name: "Dry Bag", price: [499, 1499] },
    { name: "Trekking Shoes", price: [2499, 7999] },
    { name: "Portable Water Filter", price: [1499, 4499] },
  ],
  Beauty: [
    { name: "Kumkumadi Face Oil", price: [599, 1999] },
    { name: "Ubtan Face Pack", price: [249, 699] },
    { name: "Bhringraj Hair Oil", price: [299, 899] },
    { name: "Neem Face Wash", price: [149, 449] },
    { name: "Rose Water Toner", price: [199, 599] },
    { name: "Kajal Stick", price: [149, 399] },
    { name: "Turmeric Day Cream", price: [299, 899] },
    { name: "Multani Mitti Mask", price: [199, 549] },
    { name: "Aloe Vera Gel", price: [199, 599] },
    { name: "Sandalwood Soap Bar", price: [99, 299] },
    { name: "Almond Body Lotion", price: [299, 799] },
    { name: "Herbal Shampoo", price: [299, 899] },
  ],
};

const CATEGORY_CODES: Record<string, string> = {
  Electronics: "ELEC",
  "Home & Kitchen": "HOME",
  Apparel: "APPA",
  Outdoor: "OUTD",
  Beauty: "BEAU",
};

export function productsFor(category: string): CatalogProduct[] {
  return PRODUCTS[category] ?? [];
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
    sku: "SR-ELEC-0007",
    label: "Aggressive competitor undercut",
    expectation: "Strong decrease, high confidence, likely auto-executes",
    mutate: () => ({ competitorFactor: 0.85, inventoryLevel: 480 }),
  },
  {
    sku: "SR-HOME-0012",
    label: "Margin floor blocks the obvious move",
    // Competitors have gone below our cost. The commercially "correct" move is
    // impossible, and the compliance agent has to say so.
    expectation: "Compliance ADJUSTS to the floor; margin protection visible",
    mutate: (p) => ({ competitorFactor: 0.78, cost: round(p.currentPrice * 0.88) }),
  },
  {
    sku: "SR-APPA-0003",
    label: "Demand surge with low stock",
    expectation: "Price INCREASE, scarcity plus demand",
    mutate: () => ({ inventoryLevel: 11, demandMultiplier: 2.4 }),
  },
  {
    sku: "BK-OUTD-0005",
    label: "Stale competitor data",
    expectation: "Confidence penalty routes it to a human despite a clear direction",
    mutate: () => ({ competitorAgeDays: 19 }),
  },
  {
    sku: "BK-BEAU-0009",
    label: "Conflicting signals",
    expectation: "Market says falling, demand says accelerating, disagreement penalty fires",
    mutate: () => ({ competitorFactor: 0.9, demandMultiplier: 1.8 }),
  },
];

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
