import { describe, expect, test } from "bun:test";
import type { DemandOutput, InventoryOutput, MarketIntelOutput, StrategyOutput } from "@pricewise/shared";
import { capForWeakUpstream, computeConfidence } from "../../src/agents/confidence";

// computeConfidence is pure, no I/O, no clock, so these need no mocking at
// all. That is the point of moving the arithmetic out of the prompt.

const market = (over: Partial<MarketIntelOutput> = {}): MarketIntelOutput => ({
  competitorMin: 250,
  competitorMedian: 280,
  competitorMax: 310,
  trend: "stable",
  newEntrants: [],
  dataAgeDays: 2,
  notes: "",
  confidence: 0.9,
  ...over,
});

const demand = (over: Partial<DemandOutput> = {}): DemandOutput => ({
  elasticity: -1.8,
  seasonalIndex: 1,
  velocityTrend: "steady",
  projectedUnitDeltaPct: 5,
  notes: "",
  confidence: 0.9,
  ...over,
});

const inventory = (over: Partial<InventoryOutput> = {}): InventoryOutput => ({
  stockStatus: "NORMAL",
  daysOfCover: 40,
  unitCost: 200,
  absoluteFloorPrice: 235,
  constraints: [],
  notes: "",
  confidence: 0.9,
  ...over,
});

const strategy = (over: Partial<StrategyOutput> = {}): StrategyOutput => ({
  recommendedPrice: 279,
  direction: "decrease",
  rationale: "x".repeat(50),
  factorWeights: {
    competitorPressure: 0.4,
    demandSignal: 0.2,
    inventoryPosition: 0.2,
    marginProtection: 0.2,
  },
  confidence: 0.9,
  ...over,
});

const base = {
  market: market(),
  demand: demand(),
  inventory: inventory(),
  strategy: strategy(),
  priceDeltaPct: 0.05,
  failedAgents: [],
};

describe("computeConfidence", () => {
  test("all agents at 0.9 with no penalties gives 0.9", () => {
    const result = computeConfidence(base);
    expect(result.base).toBe(0.9);
    expect(result.penalties).toHaveLength(0);
    expect(result.final).toBe(0.9);
  });

  test("is deterministic, the same inputs always give the same score", () => {
    const a = computeConfidence(base);
    const b = computeConfidence(base);
    expect(a).toEqual(b);
  });

  test("weights the agents unequally, per CONFIDENCE_WEIGHTS", () => {
    // Market carries 0.30. Dropping only market's confidence must move the
    // base by 0.30 × the difference.
    const result = computeConfidence({ ...base, market: market({ confidence: 0.5 }) });
    expect(result.base).toBeCloseTo(0.9 - 0.3 * 0.4, 2);
  });

  test("stale competitor data applies a named penalty", () => {
    const result = computeConfidence({ ...base, market: market({ dataAgeDays: 19 }) });
    expect(result.penalties).toHaveLength(1);
    expect(result.penalties[0]?.amount).toBe(0.15);
    expect(result.penalties[0]?.reason).toContain("19 days old");
  });

  test("opposing market and demand trends apply a disagreement penalty", () => {
    const result = computeConfidence({
      ...base,
      market: market({ trend: "falling" }),
      demand: demand({ velocityTrend: "accelerating" }),
    });
    expect(result.penalties.some((p) => p.reason.includes("opposite directions"))).toBe(true);
  });

  test("agreeing trends apply no disagreement penalty", () => {
    const result = computeConfidence({
      ...base,
      market: market({ trend: "falling" }),
      demand: demand({ velocityTrend: "decelerating" }),
    });
    expect(result.penalties).toHaveLength(0);
  });

  test("a missing agent redistributes its weight AND applies a penalty", () => {
    const result = computeConfidence({ ...base, demand: null, failedAgents: ["DEMAND_FORECASTING"] });

    // Redistributed: the remaining three still average 0.9, not 0.675.
    expect(result.base).toBe(0.9);
    // And the loss is accounted for once, explicitly.
    expect(result.penalties).toHaveLength(1);
    expect(result.penalties[0]?.amount).toBe(0.2);
    expect(result.penalties[0]?.reason).toContain("Demand Forecasting");
  });

  test("a large price change applies a penalty, a small one does not", () => {
    expect(computeConfidence({ ...base, priceDeltaPct: 0.14 }).penalties).toHaveLength(0);
    expect(computeConfidence({ ...base, priceDeltaPct: -0.22 }).penalties).toHaveLength(1);
  });

  test("inventory constraints apply a penalty naming the count", () => {
    const result = computeConfidence({
      ...base,
      inventory: inventory({ constraints: ["Scarcity", "Near floor"] }),
    });
    expect(result.penalties[0]?.reason).toContain("2 inventory constraint");
  });

  test("total deduction is capped so a pile-up cannot zero a sound score", () => {
    const result = computeConfidence({
      ...base,
      market: market({ dataAgeDays: 40, trend: "falling" }),
      demand: demand({ velocityTrend: "accelerating" }),
      inventory: inventory({ constraints: ["a", "b"] }),
      priceDeltaPct: 0.5,
      failedAgents: ["MARKET_INTELLIGENCE", "DEMAND_FORECASTING"],
    });

    const rawSum = result.penalties.reduce((s, p) => s + p.amount, 0);
    expect(rawSum).toBeGreaterThan(0.45);
    expect(result.totalPenalty).toBe(0.45);
  });

  test("the result is always within [0, 1]", () => {
    const worst = computeConfidence({
      ...base,
      market: market({ confidence: 0, dataAgeDays: 99 }),
      demand: demand({ confidence: 0 }),
      inventory: inventory({ confidence: 0, constraints: ["a"] }),
      strategy: strategy({ confidence: 0 }),
      priceDeltaPct: 1,
      failedAgents: ["MARKET_INTELLIGENCE"],
    });
    expect(worst.final).toBeGreaterThanOrEqual(0);
    expect(worst.final).toBeLessThanOrEqual(1);
  });

  test("the breakdown reconciles: base minus total equals final", () => {
    const result = computeConfidence({ ...base, market: market({ dataAgeDays: 19 }) });
    expect(result.final).toBeCloseTo(result.base - result.totalPenalty, 2);
  });
});

describe("capForWeakUpstream", () => {
  // Requirement AI-4 enforced in code, not asked for in a prompt, which is
  // what makes it testable at all.
  test("caps downstream confidence when upstream is below 0.5", () => {
    expect(capForWeakUpstream(0.95, 0.3)).toBe(0.6);
  });

  test("leaves it alone when upstream is healthy", () => {
    expect(capForWeakUpstream(0.95, 0.8)).toBe(0.95);
  });

  test("never raises a confidence that is already below the cap", () => {
    expect(capForWeakUpstream(0.4, 0.2)).toBe(0.4);
  });

  test("treats an absent upstream as no constraint", () => {
    expect(capForWeakUpstream(0.9, null)).toBe(0.9);
  });
});
