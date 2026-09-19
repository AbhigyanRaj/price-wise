import {
  ComplianceOutputSchema,
  DemandOutputSchema,
  InventoryOutputSchema,
  MarketIntelOutputSchema,
  StrategyOutputSchema,
  type DemandOutput,
  type InventoryOutput,
  type MarketIntelOutput,
  type StrategyOutput,
} from "@pricewise/shared";
import { env } from "../../lib/env";
import { floorPrice } from "../../services/businessRules";
import type { RuleViolation } from "../../services/businessRules";
import { DEMAND_TOOLS, INVENTORY_TOOLS, MARKET_TOOLS } from "../tools";
import type { RunAgentOptions } from "../groqClient";
import type { ToolContext } from "../types";
import {
  COMPLIANCE_SYSTEM,
  DEMAND_SYSTEM,
  INVENTORY_SYSTEM,
  MARKET_INTEL_SYSTEM,
  STRATEGY_SYSTEM,
} from "./prompts";

export interface AgentProduct {
  sku: string;
  name: string;
  category: string;
  currentPrice: number;
  cost: number;
  marginFloorPct: number;
  inventoryLevel: number;
}

const fmt = (n: number) => n.toFixed(2);

// Mechanical agents, read numbers, classify, summarise, run on the cheaper
// model. Synthesis and compliance carry the judgement, so they get the stronger
// one. Roughly half the pipeline's tokens run on the cheap tier (PRD C-2).

export function marketIntelConfig(
  product: AgentProduct,
  ctx: ToolContext,
): RunAgentOptions<MarketIntelOutput> {
  return {
    agentName: "MARKET_INTELLIGENCE",
    model: env.GROQ_MODEL_FAST,
    systemPrompt: MARKET_INTEL_SYSTEM,
    userPrompt: [
      "Product under analysis:",
      `  SKU: ${product.sku}`,
      `  Name: ${product.name}`,
      `  Category: ${product.category}`,
      `  Our current price: ${fmt(product.currentPrice)}`,
      "",
      "Determine our market position.",
    ].join("\n"),
    tools: MARKET_TOOLS,
    outputSchema: MarketIntelOutputSchema,
    ctx,
  };
}

export function inventoryConfig(
  product: AgentProduct,
  effectiveFloorPct: number,
  ctx: ToolContext,
): RunAgentOptions<InventoryOutput> {
  // Computed here, deterministically, and handed to the model. LLMs are
  // unreliable at arithmetic, and a wrong floor price is the one error in this
  // system that could cause a below-cost sale.
  const computedFloor = floorPrice(product.cost, effectiveFloorPct);

  return {
    agentName: "INVENTORY_COST",
    model: env.GROQ_MODEL_FAST,
    systemPrompt: INVENTORY_SYSTEM,
    userPrompt: [
      `Product: ${product.sku}, ${product.name} (${product.category})`,
      `Current price: ${fmt(product.currentPrice)}`,
      `Unit cost (COGS): ${fmt(product.cost)}`,
      `Margin floor for this category: ${(effectiveFloorPct * 100).toFixed(1)}%`,
      `Computed absolute floor price: ${fmt(computedFloor)}  <- do not recalculate this, use it`,
      `Inventory on hand: ${product.inventoryLevel} units`,
      "",
      "Call get_inventory_and_cost for velocity and days of cover, then assess the constraint picture.",
    ].join("\n"),
    tools: INVENTORY_TOOLS,
    outputSchema: InventoryOutputSchema,
    ctx,
  };
}

export function demandConfig(
  product: AgentProduct,
  market: MarketIntelOutput,
  ctx: ToolContext,
): RunAgentOptions<DemandOutput> {
  return {
    agentName: "DEMAND_FORECASTING",
    model: env.GROQ_MODEL_FAST,
    systemPrompt: DEMAND_SYSTEM,
    userPrompt: [
      `Product: ${product.sku}, ${product.name} (${product.category})`,
      `Our price: ${fmt(product.currentPrice)}`,
      "",
      "MARKET INTELLIGENCE AGENT REPORTED:",
      JSON.stringify(market, null, 2),
      "",
      // Passing upstream confidence downstream is what makes the pipeline
      // collaborative rather than merely sequential. The hard cap is applied in
      // code afterwards regardless (see capForWeakUpstream), this only shapes
      // the model's own reasoning.
      `Note: that agent's confidence was ${market.confidence}. If it is below 0.5,`,
      "treat its figures as indicative only and reflect that in your own confidence.",
      "",
      "Call get_demand_trends, then forecast the demand response.",
    ].join("\n"),
    tools: DEMAND_TOOLS,
    outputSchema: DemandOutputSchema,
    ctx,
  };
}

export function strategyConfig(
  product: AgentProduct,
  market: MarketIntelOutput | null,
  demand: DemandOutput | null,
  inventory: InventoryOutput,
  maxDeltaPct: number,
  ctx: ToolContext,
): RunAgentOptions<StrategyOutput> {
  const lower = Math.max(inventory.absoluteFloorPrice, product.currentPrice * (1 - maxDeltaPct));
  const upper = product.currentPrice * (1 + maxDeltaPct);

  return {
    agentName: "PRICING_STRATEGY",
    model: env.GROQ_MODEL_STRONG,
    systemPrompt: STRATEGY_SYSTEM,
    userPrompt: [
      "PRODUCT",
      `  ${product.sku}, ${product.name} (${product.category})`,
      `  Current price: ${fmt(product.currentPrice)}`,
      "",
      "HARD CONSTRAINTS (violating these invalidates your recommendation)",
      `  Absolute floor price: ${fmt(inventory.absoluteFloorPrice)}`,
      `  Maximum change from current price: ±${(maxDeltaPct * 100).toFixed(0)}%`,
      `  → permitted range: ${fmt(lower)} to ${fmt(upper)}`,
      "",
      market
        ? `MARKET INTELLIGENCE (confidence ${market.confidence})\n${JSON.stringify(market, null, 2)}`
        : "MARKET INTELLIGENCE: UNAVAILABLE, that agent did not complete. Do not invent its figures; weight competitor pressure low and say so in your rationale.",
      "",
      demand
        ? `DEMAND FORECAST (confidence ${demand.confidence})\n${JSON.stringify(demand, null, 2)}`
        : "DEMAND FORECAST: UNAVAILABLE, that agent did not complete. Do not invent its figures.",
      "",
      `INVENTORY & COST (confidence ${inventory.confidence})`,
      JSON.stringify(inventory, null, 2),
      "",
      "Produce one recommended price within the permitted range.",
    ].join("\n"),
    // No tools, deliberately: giving this agent tools would let it re-fetch and
    // contradict what the specialists concluded. It is pure synthesis.
    tools: [],
    outputSchema: StrategyOutputSchema,
    ctx,
  };
}

export function complianceConfig(
  product: AgentProduct,
  proposedPrice: number,
  violations: RuleViolation[],
  ctx: ToolContext,
): RunAgentOptions<ReturnType<typeof ComplianceOutputSchema.parse>> {
  return {
    agentName: "EXECUTION_COMPLIANCE",
    model: env.GROQ_MODEL_STRONG,
    systemPrompt: COMPLIANCE_SYSTEM,
    userPrompt: [
      `Product: ${product.sku}, ${product.name}`,
      `Current price: ${fmt(product.currentPrice)}`,
      `Proposed price: ${fmt(proposedPrice)}`,
      "",
      "RULE ENGINE FINDINGS:",
      violations.length > 0 ? JSON.stringify(violations, null, 2) : "  (none, no violations)",
      "",
      "Decide, and explain the outcome for a human reviewer.",
    ].join("\n"),
    tools: [],
    outputSchema: ComplianceOutputSchema,
    ctx,
  };
}
