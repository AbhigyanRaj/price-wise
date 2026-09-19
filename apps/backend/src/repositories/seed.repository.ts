import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import type { JsonValue } from "../lib/json";

// Seeding writes across tenants by design, which is exactly why it lives behind
// the repository layer like everything else rather than reaching for Prisma
// from a script (rule R1).

/** Truncate-then-insert, so re-running the seed is idempotent rather than
 *  accumulating duplicate catalogs. */
export async function truncateAll(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`;

  if (tables.length === 0) return;

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export function createOrganization(data: {
  name: string;
  confidenceThreshold: number;
  maxPriceDeltaPct: number;
}) {
  return prisma.organization.create({ data });
}

export function createUsers(
  orgId: string,
  users: { email: string; name: string; role: "ADMIN" | "PRICING_ANALYST"; passwordHash: string }[],
) {
  return prisma.user.createMany({
    data: users.map((u) => ({ ...u, organizationId: orgId })),
  });
}

export function createCategoryRules(
  orgId: string,
  rules: { category: string; marginFloorPct: number; maxDeltaPct: number }[],
) {
  return prisma.categoryRule.createMany({
    data: rules.map((r) => ({ ...r, organizationId: orgId })),
  });
}

export interface SeedProductInput {
  sku: string;
  name: string;
  category: string;
  currentPrice: number;
  cost: number;
  marginFloorPct: number;
  inventoryLevel: number;
  inventoryStatus: "LOW" | "NORMAL" | "OVERSTOCKED";
  competitorPrices: { competitor: string; price: number; scrapedAt: Date }[];
  demandSignals: { signalType: string; value: number; periodStart: Date; periodEnd: Date }[];
}

/**
 * One product plus its history. Nested writes keep each product atomic, and
 * createMany for the children keeps the round-trip count sane, a catalog of 54
 * products carries roughly 1,600 competitor rows between them.
 */
export async function createProductWithHistory(orgId: string, input: SeedProductInput) {
  const product = await prisma.product.create({
    data: {
      organizationId: orgId,
      sku: input.sku,
      name: input.name,
      category: input.category,
      currentPrice: input.currentPrice,
      cost: input.cost,
      marginFloorPct: input.marginFloorPct,
      inventoryLevel: input.inventoryLevel,
      inventoryStatus: input.inventoryStatus,
    },
  });

  await prisma.competitorPrice.createMany({
    data: input.competitorPrices.map((c) => ({ ...c, productId: product.id })),
  });

  await prisma.demandSignal.createMany({
    data: input.demandSignals.map((d) => ({ ...d, productId: product.id })),
  });

  return product;
}

export interface SeedRecommendationInput {
  productId: string;
  recommendedPrice: number;
  currentPriceAtTime: number;
  confidenceScore: number;
  rationale: string;
  factorWeights: JsonValue;
  status: "PENDING" | "APPROVED" | "REJECTED" | "MODIFIED" | "AUTO_EXECUTED" | "FAILED";
  resolvedByUserId?: string | null;
  resolvedAt?: Date | null;
  rejectionReason?: string | null;
  modifiedPrice?: number | null;
  createdAt: Date;
  agentRuns: {
    agentName: "MARKET_INTELLIGENCE" | "DEMAND_FORECASTING" | "INVENTORY_COST" | "PRICING_STRATEGY" | "EXECUTION_COMPLIANCE";
    input: JsonValue;
    output: JsonValue;
    toolCalls: JsonValue;
    confidence: number;
    model: string;
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
  }[];
}

/** Pre-computed recommendations with their full agent trail, so the queue and
 *  the explainability UI are populated on first login without spending a single
 *  LLM call, and so the demo survives the provider being unavailable. */
export async function createRecommendationWithRuns(orgId: string, input: SeedRecommendationInput) {
  return prisma.pricingRecommendation.create({
    data: {
      organizationId: orgId,
      productId: input.productId,
      recommendedPrice: input.recommendedPrice,
      currentPriceAtTime: input.currentPriceAtTime,
      confidenceScore: input.confidenceScore,
      rationale: input.rationale,
      factorWeights: input.factorWeights as Prisma.InputJsonValue,
      status: input.status,
      resolvedByUserId: input.resolvedByUserId ?? null,
      resolvedAt: input.resolvedAt ?? null,
      rejectionReason: input.rejectionReason ?? null,
      modifiedPrice: input.modifiedPrice ?? null,
      createdAt: input.createdAt,
      agentRuns: {
        create: input.agentRuns.map((run) => ({
          agentName: run.agentName,
          input: run.input as Prisma.InputJsonValue,
          output: run.output as Prisma.InputJsonValue,
          toolCalls: run.toolCalls as Prisma.InputJsonValue,
          confidence: run.confidence,
          model: run.model,
          promptTokens: run.promptTokens,
          completionTokens: run.completionTokens,
          durationMs: run.durationMs,
        })),
      },
    },
  });
}

export function createAuditEntries(
  orgId: string,
  entries: { userId: string | null; action: string; entityType: string; entityId: string; createdAt: Date }[],
) {
  return prisma.auditLog.createMany({
    data: entries.map((e) => ({ ...e, organizationId: orgId })),
  });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function disconnect() {
  return prisma.$disconnect();
}
