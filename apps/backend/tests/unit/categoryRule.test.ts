import { describe, expect, test } from "bun:test";
import { effectiveLimits } from "../../src/services/categoryRule.service";

/**
 * The rule that changed, and why it is worth a test of its own.
 *
 * The previous behaviour was `categoryRule?.marginFloorPct ?? product.marginFloorPct`,
 * so a category rule OVERRODE the product. Setting a 10% floor on Electronics
 * silently lowered the floor on a product configured at 25%, which means the
 * one thing this product exists to prevent got weaker because somebody edited
 * a settings page.
 */
describe("effectiveLimits", () => {
  const fallback = { marginFloorPct: 0.25, maxDeltaPct: 0.2 };

  test("with no rule, the product's own limits apply unchanged", () => {
    expect(effectiveLimits(null, fallback)).toEqual(fallback);
  });

  test("a stricter category floor tightens the product's floor", () => {
    const result = effectiveLimits({ marginFloorPct: 0.4, maxDeltaPct: 0.2 }, fallback);
    expect(result.marginFloorPct).toBe(0.4);
  });

  test("a LOOSER category floor does not weaken the product's floor", () => {
    // The regression this exists to prevent.
    const result = effectiveLimits({ marginFloorPct: 0.1, maxDeltaPct: 0.2 }, fallback);
    expect(result.marginFloorPct).toBe(0.25);
  });

  test("a tighter category delta cap tightens the organization's cap", () => {
    const result = effectiveLimits({ marginFloorPct: 0.25, maxDeltaPct: 0.05 }, fallback);
    expect(result.maxDeltaPct).toBe(0.05);
  });

  test("a WIDER category delta cap does not widen the organization's cap", () => {
    const result = effectiveLimits({ marginFloorPct: 0.25, maxDeltaPct: 0.9 }, fallback);
    expect(result.maxDeltaPct).toBe(0.2);
  });

  test("a rule can only ever tighten, in both directions at once", () => {
    const result = effectiveLimits({ marginFloorPct: 0.45, maxDeltaPct: 0.03 }, fallback);
    expect(result).toEqual({ marginFloorPct: 0.45, maxDeltaPct: 0.03 });
  });
});
