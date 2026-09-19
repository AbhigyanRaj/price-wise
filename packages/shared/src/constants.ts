// Literals that would otherwise be duplicated between the API, the web client
// and the tests. One definition, so a rename is a compile error rather than a
// silent mismatch.

export const AGENT_NAMES = [
  "MARKET_INTELLIGENCE",
  "INVENTORY_COST",
  "DEMAND_FORECASTING",
  "PRICING_STRATEGY",
  "EXECUTION_COMPLIANCE",
] as const;

export type AgentNameValue = (typeof AGENT_NAMES)[number];

export const AGENT_DISPLAY_NAMES: Record<AgentNameValue, string> = {
  MARKET_INTELLIGENCE: "Market Intelligence",
  INVENTORY_COST: "Inventory & Cost",
  DEMAND_FORECASTING: "Demand Forecasting",
  PRICING_STRATEGY: "Pricing Strategy",
  EXECUTION_COMPLIANCE: "Execution & Compliance",
};

// Losing either of these aborts the run; the other three only degrade it.
export const CRITICAL_AGENTS: AgentNameValue[] = ["INVENTORY_COST", "PRICING_STRATEGY"];

// Weights for the base confidence score. Must sum to 1.
export const CONFIDENCE_WEIGHTS = {
  market: 0.3,
  demand: 0.25,
  inventory: 0.25,
  strategy: 0.2,
} as const;

export const CONFIDENCE_PENALTIES = {
  staleData: 0.15,
  conflictingSignals: 0.1,
  missingAgent: 0.2,
  largePriceChange: 0.1,
  inventoryConstraints: 0.05,
} as const;

// Caps total deduction so a recommendation cannot be penalised to zero by an
// unlucky pile-up of independent conditions.
export const MAX_TOTAL_PENALTY = 0.45;

export const STALE_DATA_DAYS = 7;
export const LARGE_PRICE_CHANGE_PCT = 0.15;

export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_CURSOR_LIMIT = 25;
export const MAX_PAGE_SIZE = 100;

// Confidence badge bands, shared so the queue and the detail page cannot disagree.
export const CONFIDENCE_BANDS = { high: 0.85, medium: 0.7 } as const;
