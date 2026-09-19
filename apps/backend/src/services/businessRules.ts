export type ViolationSeverity = "block" | "adjust";

export interface RuleViolation {
  rule: "BELOW_COST" | "MARGIN_FLOOR" | "MAX_DELTA" | "MINIMUM_PRICE";
  severity: ViolationSeverity;
  detail: string;
}

export interface RuleContext {
  currentPrice: number;
  cost: number;
  /** Product floor, overridden by the category rule when one exists. */
  marginFloorPct: number;
  maxDeltaPct: number;
}

const PLATFORM_MINIMUM_PRICE = 0.99;

/**
 * The deterministic rule engine. This, not the Execution & Compliance agent
 * is the safety mechanism: the agent makes the outcome legible, but a model
 * cannot be talked out of a margin floor that is enforced here in TypeScript
 * (rule R8).
 *
 * Pure: no I/O, no database, no clock. Every branch is unit-testable.
 */
export function checkBusinessRules(proposedPrice: number, ctx: RuleContext): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (proposedPrice <= ctx.cost) {
    violations.push({
      rule: "BELOW_COST",
      severity: "block",
      detail: `Proposed ${proposedPrice.toFixed(2)} is at or below unit cost ${ctx.cost.toFixed(2)}`,
    });
  }

  const margin = proposedPrice > 0 ? (proposedPrice - ctx.cost) / proposedPrice : 0;
  if (margin < ctx.marginFloorPct) {
    violations.push({
      rule: "MARGIN_FLOOR",
      severity: "block",
      detail: `Margin ${(margin * 100).toFixed(1)}% is below the ${(ctx.marginFloorPct * 100).toFixed(1)}% floor`,
    });
  }

  const delta = ctx.currentPrice > 0 ? Math.abs(proposedPrice - ctx.currentPrice) / ctx.currentPrice : 0;
  if (delta > ctx.maxDeltaPct) {
    // "adjust" rather than "block": the direction is fine, the magnitude is
    // not, so the nearest compliant price is a legitimate outcome.
    violations.push({
      rule: "MAX_DELTA",
      severity: "adjust",
      detail: `Change of ${(delta * 100).toFixed(1)}% exceeds the ${(ctx.maxDeltaPct * 100).toFixed(0)}% limit`,
    });
  }

  if (proposedPrice < PLATFORM_MINIMUM_PRICE) {
    violations.push({
      rule: "MINIMUM_PRICE",
      severity: "block",
      detail: `Below the platform minimum of ${PLATFORM_MINIMUM_PRICE.toFixed(2)}`,
    });
  }

  return violations;
}

export function hasBlockingViolation(violations: RuleViolation[]): boolean {
  return violations.some((v) => v.severity === "block");
}

/** The lowest price satisfying the margin floor. Computed here so the agents
 *  are handed the number rather than deriving it, an LLM arithmetic slip on
 *  this value is the one error that could cause a below-cost sale. */
export function floorPrice(cost: number, marginFloorPct: number): number {
  return Math.round((cost / (1 - marginFloorPct)) * 100) / 100;
}

/** Clamps a price into the permitted band: at or above the margin floor, and
 *  within the maximum movement from the current price. */
export function clampToPermittedRange(proposedPrice: number, ctx: RuleContext): number {
  const lower = Math.max(floorPrice(ctx.cost, ctx.marginFloorPct), PLATFORM_MINIMUM_PRICE);
  const upper = ctx.currentPrice * (1 + ctx.maxDeltaPct);
  const lowerByDelta = ctx.currentPrice * (1 - ctx.maxDeltaPct);

  const clamped = Math.min(Math.max(proposedPrice, Math.max(lower, lowerByDelta)), upper);
  return Math.round(clamped * 100) / 100;
}
