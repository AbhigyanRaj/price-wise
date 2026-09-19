import type { AgentNameValue, DemandOutput, InventoryOutput, MarketIntelOutput } from "@pricewise/shared";
import { notFound } from "../lib/errors";
import { logger } from "../lib/logger";
import type { JsonValue } from "../lib/json";
import * as productRepo from "../repositories/product.repository";
import * as orgRepo from "../repositories/organization.repository";
import * as categoryRuleRepo from "../repositories/categoryRule.repository";
import * as recRepo from "../repositories/recommendation.repository";
import { checkBusinessRules, clampToPermittedRange, hasBlockingViolation } from "../services/businessRules";
import { executeRecommendation } from "../services/execution.service";
import { capForWeakUpstream, computeConfidence } from "./confidence";
import {
  complianceConfig,
  demandConfig,
  inventoryConfig,
  marketIntelConfig,
  strategyConfig,
  type AgentProduct,
} from "./definitions";
import { runAgentWithRepair } from "./groqClient";
import type { PipelineEvent, RunAgentResult, ToolContext } from "./types";

/**
 * An async generator, deliberately. The orchestrator yields events and knows
 * nothing about HTTP: the SSE route consumes it and writes frames, and a future
 * background worker could consume the same generator and write to a queue.
 * Business logic is not coupled to transport.
 */
export async function* orchestrate(
  orgId: string,
  productId: string,
  requestId: string,
): AsyncGenerator<PipelineEvent, void, undefined> {
  const [productRow, org] = await Promise.all([
    productRepo.findById(orgId, productId),
    orgRepo.findById(orgId),
  ]);
  if (!productRow) throw notFound("Product");
  if (!org) throw notFound("Organization");

  const categoryRule = await categoryRuleRepo.findForCategory(orgId, productRow.category);
  const effectiveFloorPct = categoryRule?.marginFloorPct ?? productRow.marginFloorPct;
  const maxDeltaPct = categoryRule?.maxDeltaPct ?? org.maxPriceDeltaPct;

  const product: AgentProduct = {
    sku: productRow.sku,
    name: productRow.name,
    category: productRow.category,
    currentPrice: Number(productRow.currentPrice),
    cost: Number(productRow.cost),
    marginFloorPct: effectiveFloorPct,
    inventoryLevel: productRow.inventoryLevel,
  };

  const recommendation = await recRepo.createPending(orgId, productId, product.currentPrice);
  const ctx: ToolContext = { orgId, productId, requestId };
  const failed: AgentNameValue[] = [];

  /** Runs one agent and persists an AgentRun row whichever way it goes, so a
   *  failure is as inspectable after the fact as a success (PRD AI, P4). */
  async function runAndPersist<T>(
    agent: AgentNameValue,
    config: Parameters<typeof runAgentWithRepair<T>>[0],
    confidenceOf: (output: T) => number | null,
  ): Promise<RunAgentResult<T> | null> {
    const started = Date.now();
    try {
      const result = await runAgentWithRepair<T>(config);
      await recRepo.recordAgentRun({
        recommendationId: recommendation.id,
        agentName: agent,
        input: { systemPrompt: config.systemPrompt, userPrompt: config.userPrompt } as JsonValue,
        output: result.output as JsonValue,
        toolCalls: result.toolCalls as unknown as JsonValue,
        confidence: confidenceOf(result.output),
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs: result.durationMs,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ agent, recommendationId: recommendation.id, err }, "agent failed");

      await recRepo.recordAgentRun({
        recommendationId: recommendation.id,
        agentName: agent,
        input: { systemPrompt: config.systemPrompt, userPrompt: config.userPrompt } as JsonValue,
        output: null,
        toolCalls: [] as unknown as JsonValue,
        confidence: null,
        model: config.model,
        promptTokens: 0,
        completionTokens: 0,
        durationMs: Date.now() - started,
        error: message,
      });

      failed.push(agent);
      return null;
    }
  }

  // ---- WAVE 1: independent, so genuinely concurrent ----------------------
  yield { type: "agent_started", agent: "MARKET_INTELLIGENCE", startedAt: new Date().toISOString() };
  yield { type: "agent_started", agent: "INVENTORY_COST", startedAt: new Date().toISOString() };

  const [marketResult, inventoryResult] = await Promise.all([
    runAndPersist<MarketIntelOutput>("MARKET_INTELLIGENCE", marketIntelConfig(product, ctx), (o) => o.confidence),
    runAndPersist<InventoryOutput>(
      "INVENTORY_COST",
      inventoryConfig(product, effectiveFloorPct, ctx),
      (o) => o.confidence,
    ),
  ]);

  yield emit("MARKET_INTELLIGENCE", marketResult, (o) => o.confidence);
  yield emit("INVENTORY_COST", inventoryResult, (o) => o.confidence);

  const market = marketResult?.output ?? null;
  const inventory = inventoryResult?.output ?? null;

  // ---- WAVE 2: demand depends on market ----------------------------------
  let demand: DemandOutput | null = null;

  if (market) {
    yield { type: "agent_started", agent: "DEMAND_FORECASTING", startedAt: new Date().toISOString() };
    const result = await runAndPersist<DemandOutput>(
      "DEMAND_FORECASTING",
      demandConfig(product, market, ctx),
      (o) => o.confidence,
    );

    if (result) {
      // Requirement AI-4, enforced in code rather than asked for in the prompt:
      // a forecast built on a shaky market read cannot report high confidence.
      result.output.confidence = capForWeakUpstream(result.output.confidence, market.confidence);
      demand = result.output;
    }
    yield emit("DEMAND_FORECASTING", result, (o) => o.confidence);
  } else {
    // Degrade rather than abort. Strategy is told the input is missing, and the
    // confidence score absorbs a named penalty for it.
    failed.push("DEMAND_FORECASTING");
    yield {
      type: "agent_skipped",
      agent: "DEMAND_FORECASTING",
      reason: "Market intelligence unavailable",
    };
  }

  // ---- WAVE 3: strategy requires the cost floor at minimum ---------------
  if (!inventory) {
    const reason = "Cannot produce a recommendation without cost constraints";
    await recRepo.markFailed(recommendation.id, reason);
    yield { type: "recommendation_failed", error: reason, failedAgent: "INVENTORY_COST" };
    return;
  }

  yield { type: "agent_started", agent: "PRICING_STRATEGY", startedAt: new Date().toISOString() };
  const strategyResult = await runAndPersist(
    "PRICING_STRATEGY",
    strategyConfig(product, market, demand, inventory, maxDeltaPct, ctx),
    (o) => o.confidence,
  );

  if (!strategyResult) {
    const reason = "Synthesis failed";
    await recRepo.markFailed(recommendation.id, reason);
    yield { type: "recommendation_failed", error: reason, failedAgent: "PRICING_STRATEGY" };
    return;
  }

  const strategy = strategyResult.output;

  // The model was told the permitted range. Clamp anyway, and reduce
  // confidence when the clamp fires, because an agent that ignored an explicit
  // constraint has demonstrated it is less reliable on this case (AI-16).
  const clamped = clampToPermittedRange(strategy.recommendedPrice, {
    currentPrice: product.currentPrice,
    cost: product.cost,
    marginFloorPct: effectiveFloorPct,
    maxDeltaPct,
  });

  if (Math.abs(clamped - strategy.recommendedPrice) > 0.001) {
    logger.warn(
      { productId, proposed: strategy.recommendedPrice, clamped },
      "strategy agent output clamped",
    );
    strategy.recommendedPrice = clamped;
    strategy.confidence = Math.min(strategy.confidence, 0.6);
  }

  yield emit("PRICING_STRATEGY", strategyResult, (o) => o.confidence);

  // ---- Confidence, computed in code --------------------------------------
  const deltaPct = (strategy.recommendedPrice - product.currentPrice) / product.currentPrice;
  const confidence = computeConfidence({
    market,
    demand,
    inventory,
    strategy,
    priceDeltaPct: deltaPct,
    failedAgents: failed,
  });

  // ---- WAVE 4: compliance -------------------------------------------------
  yield { type: "agent_started", agent: "EXECUTION_COMPLIANCE", startedAt: new Date().toISOString() };

  const violations = checkBusinessRules(strategy.recommendedPrice, {
    currentPrice: product.currentPrice,
    cost: product.cost,
    marginFloorPct: effectiveFloorPct,
    maxDeltaPct,
  });

  const complianceResult = await runAndPersist(
    "EXECUTION_COMPLIANCE",
    complianceConfig(product, strategy.recommendedPrice, violations, ctx),
    () => null,
  );
  yield emit("EXECUTION_COMPLIANCE", complianceResult, () => null);

  const compliance = complianceResult?.output ?? null;

  const factorWeights = {
    ...strategy.factorWeights,
    confidenceBreakdown: confidence,
  } as unknown as JsonValue;

  // A blocked recommendation always goes to a human, whatever the confidence.
  // The rule engine is authoritative here, not the agent's opinion of it.
  const blocked = hasBlockingViolation(violations) || compliance?.decision === "block";

  if (blocked) {
    await recRepo.finalize(recommendation.id, {
      recommendedPrice: strategy.recommendedPrice,
      confidenceScore: confidence.final,
      rationale: strategy.rationale,
      factorWeights,
      status: "PENDING",
    });
    yield {
      type: "recommendation_ready",
      autoExecuted: false,
      blocked: true,
      recommendationId: recommendation.id,
    };
    return;
  }

  const finalPrice = compliance?.finalPrice ?? strategy.recommendedPrice;
  // Inclusive boundary, documented: a score exactly equal to the threshold
  // auto-executes (PRD edge case 29).
  const shouldAutoExecute = confidence.final >= org.confidenceThreshold;

  await recRepo.finalize(recommendation.id, {
    recommendedPrice: finalPrice,
    confidenceScore: confidence.final,
    rationale: strategy.rationale,
    factorWeights,
    status: shouldAutoExecute ? "AUTO_EXECUTED" : "PENDING",
  });

  if (shouldAutoExecute) {
    try {
      await executeRecommendation(orgId, recommendation.id, finalPrice, null);
    } catch {
      // A failed auto-execution falls back to the human queue rather than
      // losing the recommendation (FR-EXE-5).
      await recRepo.setStatus(recommendation.id, "PENDING");
      yield {
        type: "recommendation_ready",
        autoExecuted: false,
        executionFailed: true,
        recommendationId: recommendation.id,
      };
      return;
    }
  }

  yield {
    type: "recommendation_ready",
    autoExecuted: shouldAutoExecute,
    recommendationId: recommendation.id,
  };
}

function emit<T>(
  agent: AgentNameValue,
  result: RunAgentResult<T> | null,
  confidenceOf: (output: T) => number | null,
): PipelineEvent {
  if (!result) {
    return { type: "agent_failed", agent, error: "Agent did not complete", willRetry: false };
  }
  return {
    type: "agent_completed",
    agent,
    durationMs: result.durationMs,
    confidence: confidenceOf(result.output),
    output: result.output as JsonValue,
    toolCalls: result.toolCalls,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
}
