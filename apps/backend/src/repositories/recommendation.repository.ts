import type { Prisma } from "../generated/prisma/client";
import type { RecommendationQuery, RecStatus } from "@pricewise/shared";
import { prisma } from "../lib/prisma";
import type { JsonValue } from "../lib/json";

// orgId first and required on every function (rule R2).

const LIST_INCLUDE = {
  product: { select: { id: true, sku: true, name: true, category: true, currentPrice: true } },
  resolvedBy: { select: { id: true, name: true } },
} satisfies Prisma.PricingRecommendationInclude;

export async function findMany(orgId: string, q: RecommendationQuery) {
  const rows = await prisma.pricingRecommendation.findMany({
    where: {
      organizationId: orgId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.minConfidence !== undefined ? { confidenceScore: { gte: q.minConfidence } } : {}),
    },
    // id breaks ties deterministically: two rows created in the same
    // millisecond would otherwise order non-deterministically and the cursor
    // could skip or repeat one.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // One extra row reveals whether there is a next page without a count query.
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: LIST_INCLUDE,
  });

  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, hasMore };
}

export function findById(orgId: string, id: string) {
  // Tenant scope inside the predicate, so another org's id is simply not found.
  return prisma.pricingRecommendation.findFirst({
    where: { id, organizationId: orgId },
    include: {
      product: true,
      resolvedBy: { select: { id: true, name: true, email: true } },
      agentRuns: { orderBy: { createdAt: "asc" } },
      executions: { orderBy: { createdAt: "desc" } },
    },
  });
}

/** Past decisions on the same product, context for the current one, including
 *  why anyone disagreed last time (FR-EXP-7). */
export function findComparable(orgId: string, productId: string, excludeId: string) {
  return prisma.pricingRecommendation.findMany({
    where: {
      organizationId: orgId,
      productId,
      id: { not: excludeId },
      status: { in: ["APPROVED", "REJECTED", "MODIFIED", "AUTO_EXECUTED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      recommendedPrice: true,
      modifiedPrice: true,
      confidenceScore: true,
      status: true,
      rejectionReason: true,
      createdAt: true,
    },
  });
}

/**
 * Conditional claim, per rule R10. The status is part of the WHERE clause, so
 * two analysts clicking approve at the same moment cannot both succeed, the
 * second updates zero rows. Read-then-check would be a TOCTOU bug that
 * double-executes a price change.
 *
 * Returns the updated row, or null if another actor got there first.
 */
export async function claimAndResolve(
  orgId: string,
  id: string,
  to: RecStatus,
  data: {
    resolvedByUserId: string | null;
    rejectionReason?: string | null;
    modifiedPrice?: number | null;
  },
) {
  const result = await prisma.pricingRecommendation.updateMany({
    where: { id, organizationId: orgId, status: "PENDING" },
    data: {
      status: to,
      resolvedByUserId: data.resolvedByUserId,
      resolvedAt: new Date(),
      ...(data.rejectionReason !== undefined ? { rejectionReason: data.rejectionReason } : {}),
      ...(data.modifiedPrice !== undefined ? { modifiedPrice: data.modifiedPrice } : {}),
    },
  });

  if (result.count === 0) return null;
  return prisma.pricingRecommendation.findFirst({ where: { id, organizationId: orgId }, include: LIST_INCLUDE });
}

export function createPending(
  orgId: string,
  productId: string,
  currentPriceAtTime: number,
) {
  return prisma.pricingRecommendation.create({
    data: {
      organizationId: orgId,
      productId,
      recommendedPrice: currentPriceAtTime,
      currentPriceAtTime,
      confidenceScore: 0,
      rationale: "",
      status: "PENDING",
    },
  });
}

export function finalize(
  id: string,
  data: {
    recommendedPrice: number;
    confidenceScore: number;
    rationale: string;
    factorWeights: JsonValue;
    status: RecStatus;
  },
) {
  return prisma.pricingRecommendation.update({
    where: { id },
    data: {
      recommendedPrice: data.recommendedPrice,
      confidenceScore: data.confidenceScore,
      rationale: data.rationale,
      factorWeights: data.factorWeights as Prisma.InputJsonValue,
      status: data.status,
    },
  });
}

export function markFailed(id: string, failureReason: string) {
  return prisma.pricingRecommendation.update({
    where: { id },
    data: { status: "FAILED", failureReason },
  });
}

export function setStatus(id: string, status: RecStatus) {
  return prisma.pricingRecommendation.update({ where: { id }, data: { status } });
}

export function recordAgentRun(data: {
  recommendationId: string;
  agentName: "MARKET_INTELLIGENCE" | "DEMAND_FORECASTING" | "INVENTORY_COST" | "PRICING_STRATEGY" | "EXECUTION_COMPLIANCE";
  input: JsonValue;
  output: JsonValue | null;
  toolCalls: JsonValue;
  confidence: number | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  error?: string | null;
}) {
  return prisma.agentRun.create({
    data: {
      recommendationId: data.recommendationId,
      agentName: data.agentName,
      input: data.input as Prisma.InputJsonValue,
      // Omit the key entirely when there is no output (a failed agent) rather
      // than passing undefined, exactOptionalPropertyTypes treats an absent
      // key and an undefined one as different types.
      ...(data.output !== null ? { output: data.output as Prisma.InputJsonValue } : {}),
      toolCalls: data.toolCalls as Prisma.InputJsonValue,
      confidence: data.confidence,
      model: data.model,
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      durationMs: data.durationMs,
      error: data.error ?? null,
    },
  });
}

export function recordExecution(data: {
  recommendationId: string;
  attemptedPrice: number;
  succeeded: boolean;
  platformResponse: JsonValue;
  rolledBack: boolean;
}) {
  return prisma.priceExecution.create({
    data: {
      recommendationId: data.recommendationId,
      attemptedPrice: data.attemptedPrice,
      succeeded: data.succeeded,
      platformResponse: data.platformResponse as Prisma.InputJsonValue,
      rolledBack: data.rolledBack,
    },
  });
}

/** Recent scores, for the admin threshold preview ("of your last 20, N would
 *  have auto-executed at this threshold"). */
export function recentConfidenceScores(orgId: string, take = 20) {
  return prisma.pricingRecommendation.findMany({
    where: { organizationId: orgId, status: { not: "FAILED" } },
    orderBy: { createdAt: "desc" },
    take,
    select: { confidenceScore: true },
  });
}
