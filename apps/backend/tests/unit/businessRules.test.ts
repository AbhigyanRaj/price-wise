import { describe, expect, test } from "bun:test";
import {
  checkBusinessRules,
  clampToPermittedRange,
  floorPrice,
  hasBlockingViolation,
} from "../../src/services/businessRules";

// The rule engine is the actual safety mechanism, not the compliance agent
// so it gets a test per branch. Pure function, no mocking needed.

const ctx = {
  currentPrice: 329.99,
  cost: 210.5,
  marginFloorPct: 0.15,
  maxDeltaPct: 0.2,
};

describe("floorPrice", () => {
  test("is the lowest price satisfying the margin floor", () => {
    // 210.50 / (1 - 0.15) = 247.647… → 247.65
    expect(floorPrice(210.5, 0.15)).toBe(247.65);
  });

  test("a price exactly at the floor yields exactly the floor margin", () => {
    const floor = floorPrice(100, 0.25);
    const margin = (floor - 100) / floor;
    expect(margin).toBeCloseTo(0.25, 4);
  });
});

describe("checkBusinessRules", () => {
  test("a healthy price produces no violations", () => {
    expect(checkBusinessRules(299.99, ctx)).toHaveLength(0);
  });

  test("blocks a price at or below cost", () => {
    const violations = checkBusinessRules(210.5, ctx);
    expect(violations.some((v) => v.rule === "BELOW_COST" && v.severity === "block")).toBe(true);
  });

  test("blocks a price that breaches the margin floor but clears cost", () => {
    // 240 is above cost 210.50 but below the 247.65 floor.
    const violations = checkBusinessRules(240, ctx);
    expect(violations.some((v) => v.rule === "BELOW_COST")).toBe(false);
    expect(violations.some((v) => v.rule === "MARGIN_FLOOR" && v.severity === "block")).toBe(true);
  });

  test("flags an oversized change as ADJUST, not block, the direction is fine", () => {
    // +30% against a 20% limit.
    const violations = checkBusinessRules(428.99, ctx);
    const delta = violations.find((v) => v.rule === "MAX_DELTA");
    expect(delta?.severity).toBe("adjust");
    expect(hasBlockingViolation(violations)).toBe(false);
  });

  test("a change exactly at the limit is permitted, the boundary is inclusive", () => {
    const atLimit = ctx.currentPrice * 1.2;
    expect(checkBusinessRules(atLimit, ctx).some((v) => v.rule === "MAX_DELTA")).toBe(false);
  });

  test("blocks below the platform minimum", () => {
    const violations = checkBusinessRules(0.5, { ...ctx, cost: 0.1, marginFloorPct: 0 });
    expect(violations.some((v) => v.rule === "MINIMUM_PRICE" && v.severity === "block")).toBe(true);
  });

  test("reports every violation that applies, not just the first", () => {
    const violations = checkBusinessRules(50, ctx);
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain("BELOW_COST");
    expect(rules).toContain("MARGIN_FLOOR");
    expect(rules).toContain("MAX_DELTA");
  });

  test("category rules override the product floor when supplied", () => {
    const strict = checkBusinessRules(299.99, { ...ctx, marginFloorPct: 0.4 });
    expect(strict.some((v) => v.rule === "MARGIN_FLOOR")).toBe(true);
  });
});

describe("clampToPermittedRange", () => {
  test("leaves a compliant price untouched", () => {
    expect(clampToPermittedRange(299.99, ctx)).toBe(299.99);
  });

  test("raises a below-range price to whichever lower bound binds harder", () => {
    // Two lower bounds apply: the margin floor (247.65) and the max-delta floor
    // (329.99 - 20% = 263.99). The delta bound is higher, so it wins. A price
    // must satisfy BOTH, not just the one that happens to be named first.
    expect(clampToPermittedRange(180, ctx)).toBeCloseTo(263.99, 2);
  });

  test("the margin floor binds when it is the higher of the two bounds", () => {
    // Widen the delta allowance so the margin floor becomes the constraint.
    const wide = { ...ctx, maxDeltaPct: 0.9 };
    expect(clampToPermittedRange(180, wide)).toBe(floorPrice(wide.cost, wide.marginFloorPct));
  });

  test("caps an excessive increase at the delta limit", () => {
    expect(clampToPermittedRange(900, ctx)).toBeCloseTo(329.99 * 1.2, 2);
  });

  test("the clamped result never violates a blocking rule", () => {
    for (const proposed of [1, 50, 180, 240, 299, 500, 10_000]) {
      const clamped = clampToPermittedRange(proposed, ctx);
      expect(hasBlockingViolation(checkBusinessRules(clamped, ctx))).toBe(false);
    }
  });
});
