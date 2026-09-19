import { z } from "zod";

// These are the contracts the LLM must satisfy. They live in shared rather than
// the backend because the recommendation detail page renders each agent's output
// in a typed component, so a prompt change that alters an output shape breaks
// the frontend build immediately instead of drifting silently.

const Confidence = z.number().min(0).max(1);

export const MarketIntelOutputSchema = z.object({
  competitorMin: z.number().nonnegative(),
  competitorMedian: z.number().nonnegative(),
  competitorMax: z.number().nonnegative(),
  trend: z.enum(["rising", "falling", "stable"]),
  newEntrants: z.array(z.string()).max(10),
  dataAgeDays: z.number().nonnegative(),
  notes: z.string().max(600),
  confidence: Confidence,
});

export const DemandOutputSchema = z.object({
  elasticity: z.number(), // negative for normal goods
  seasonalIndex: z.number().positive(), // 1.0 = baseline
  velocityTrend: z.enum(["accelerating", "steady", "decelerating"]),
  projectedUnitDeltaPct: z.number(),
  notes: z.string().max(600),
  confidence: Confidence,
});

export const InventoryOutputSchema = z.object({
  stockStatus: z.enum(["LOW", "NORMAL", "OVERSTOCKED"]),
  daysOfCover: z.number().nonnegative(),
  unitCost: z.number().nonnegative(),
  absoluteFloorPrice: z.number().nonnegative(),
  constraints: z.array(z.string()).max(10),
  notes: z.string().max(600),
  confidence: Confidence,
});

export const StrategyOutputSchema = z.object({
  recommendedPrice: z.number().positive(),
  direction: z.enum(["increase", "decrease", "hold"]),
  rationale: z.string().min(40).max(1500),
  // Rendered in the UI so a human can see what drove the recommendation, which
  // is why the agent is asked to be honest about near-zero weights.
  factorWeights: z.object({
    competitorPressure: z.number().min(0).max(1),
    demandSignal: z.number().min(0).max(1),
    inventoryPosition: z.number().min(0).max(1),
    marginProtection: z.number().min(0).max(1),
  }),
  confidence: Confidence,
});

export const ComplianceOutputSchema = z.object({
  decision: z.enum(["allow", "block", "adjust"]),
  finalPrice: z.number().positive(),
  violations: z
    .array(
      z.object({
        rule: z.string(),
        detail: z.string(),
      }),
    )
    .max(10),
  notes: z.string().max(600),
});

// Note: no agent schema has a field outside its own responsibility. An agent
// that cannot express an out-of-scope opinion cannot have one, that is the
// enforcement mechanism behind "stay in your lane" (PRD requirement AI-1).

export type MarketIntelOutput = z.infer<typeof MarketIntelOutputSchema>;
export type DemandOutput = z.infer<typeof DemandOutputSchema>;
export type InventoryOutput = z.infer<typeof InventoryOutputSchema>;
export type StrategyOutput = z.infer<typeof StrategyOutputSchema>;
export type ComplianceOutput = z.infer<typeof ComplianceOutputSchema>;
