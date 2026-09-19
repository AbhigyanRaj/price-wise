import type { RecommendationQuery, RecStatus } from "@pricewise/shared";
import { AppError, notFound } from "../lib/errors";
import * as recRepo from "../repositories/recommendation.repository";
import * as productRepo from "../repositories/product.repository";
import * as orgRepo from "../repositories/organization.repository";
import * as categoryRuleRepo from "../repositories/categoryRule.repository";
import * as auditService from "./audit.service";
import { executeRecommendation } from "./execution.service";
import { checkBusinessRules, hasBlockingViolation } from "./businessRules";

/**
 * The state machine, declared rather than implied. Terminal states are
 * genuinely terminal: re-approving an approved recommendation would execute a
 * second price change, so it is made impossible here rather than by the UI
 * hiding a button.
 */
const ALLOWED_TRANSITIONS: Record<RecStatus, RecStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "MODIFIED", "FAILED"],
  APPROVED: [],
  REJECTED: [],
  MODIFIED: [],
  AUTO_EXECUTED: [],
  FAILED: [],
};

export function canTransition(from: RecStatus, to: RecStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function listRecommendations(orgId: string, q: RecommendationQuery) {
  return recRepo.findMany(orgId, q);
}

export async function getRecommendationDetail(orgId: string, id: string) {
  const rec = await recRepo.findById(orgId, id);
  if (!rec) throw notFound("Recommendation");

  const comparable = await recRepo.findComparable(orgId, rec.productId, rec.id);
  return { ...rec, comparable };
}

/**
 * Claim-then-act, per rule R10. The status check lives inside the UPDATE's WHERE
 * clause, so two analysts approving simultaneously cannot both win, the loser
 * updates zero rows and gets a 409. A read-then-check would let both through.
 *
 * The claim happens BEFORE execution: better to mark a recommendation approved
 * and have the platform push fail (which rolls back and is recorded) than to
 * execute twice because two requests both passed a check.
 */
async function claim(orgId: string, id: string, to: RecStatus, data: Parameters<typeof recRepo.claimAndResolve>[3]) {
  const existing = await recRepo.findById(orgId, id);
  if (!existing) throw notFound("Recommendation");

  if (!canTransition(existing.status, to)) {
    throw new AppError("CONFLICT", `Cannot move a ${existing.status} recommendation to ${to}`);
  }

  const claimed = await recRepo.claimAndResolve(orgId, id, to, data);
  if (!claimed) {
    // Lost the race: another actor resolved it between our read and our write.
    throw new AppError("CONFLICT", "This recommendation was already resolved");
  }

  return { claimed, previousStatus: existing.status, recommendedPrice: Number(existing.recommendedPrice) };
}

export async function approve(orgId: string, actorId: string, id: string) {
  const { claimed, previousStatus, recommendedPrice } = await claim(orgId, id, "APPROVED", {
    resolvedByUserId: actorId,
  });

  try {
    await executeRecommendation(orgId, id, recommendedPrice, actorId);
  } catch (err) {
    // Execution failed and already rolled the price back. Return the
    // recommendation to the queue rather than leaving it falsely approved.
    await recRepo.setStatus(id, "PENDING");
    throw err;
  }

  await auditService.record({
    orgId,
    userId: actorId,
    action: "RECOMMENDATION_APPROVED",
    entityType: "PricingRecommendation",
    entityId: id,
    beforeValue: { status: previousStatus },
    afterValue: { status: "APPROVED", executedPrice: recommendedPrice },
  });

  return claimed;
}

export async function reject(orgId: string, actorId: string, id: string, reason: string) {
  // No execution: the product price is untouched.
  const { claimed, previousStatus } = await claim(orgId, id, "REJECTED", {
    resolvedByUserId: actorId,
    rejectionReason: reason,
  });

  await auditService.record({
    orgId,
    userId: actorId,
    action: "RECOMMENDATION_REJECTED",
    entityType: "PricingRecommendation",
    entityId: id,
    beforeValue: { status: previousStatus },
    afterValue: { status: "REJECTED", reason },
  });

  return claimed;
}

export async function modify(orgId: string, actorId: string, id: string, newPrice: number) {
  const existing = await recRepo.findById(orgId, id);
  if (!existing) throw notFound("Recommendation");

  const product = await productRepo.findById(orgId, existing.productId);
  if (!product) throw notFound("Product");

  const org = await orgRepo.findById(orgId);
  if (!org) throw notFound("Organization");

  const categoryRule = await categoryRuleRepo.findForCategory(orgId, product.category);

  // A human is not exempt from the rule engine. They may override the AI's
  // judgement; they may not sell below cost.
  const violations = checkBusinessRules(newPrice, {
    currentPrice: Number(product.currentPrice),
    cost: Number(product.cost),
    marginFloorPct: categoryRule?.marginFloorPct ?? product.marginFloorPct,
    maxDeltaPct: categoryRule?.maxDeltaPct ?? org.maxPriceDeltaPct,
  });

  if (hasBlockingViolation(violations)) {
    throw new AppError("VALIDATION_ERROR", "That price violates a business rule", {
      violations: violations.filter((v) => v.severity === "block"),
    });
  }

  const { claimed, previousStatus } = await claim(orgId, id, "MODIFIED", {
    resolvedByUserId: actorId,
    modifiedPrice: newPrice,
  });

  try {
    await executeRecommendation(orgId, id, newPrice, actorId);
  } catch (err) {
    await recRepo.setStatus(id, "PENDING");
    throw err;
  }

  // Both numbers are stored deliberately. The distribution of this delta over
  // time is the only honest measure of whether the agents are any good, and it
  // cannot be reconstructed later if it is not captured now (TR-8).
  await auditService.record({
    orgId,
    userId: actorId,
    action: "RECOMMENDATION_MODIFIED",
    entityType: "PricingRecommendation",
    entityId: id,
    beforeValue: {
      status: previousStatus,
      aiRecommendedPrice: Number(existing.recommendedPrice),
      confidence: existing.confidenceScore,
    },
    afterValue: { status: "MODIFIED", humanChosenPrice: newPrice },
  });

  return claimed;
}

/** Recent scores for the admin threshold preview. */
export async function thresholdPreview(orgId: string) {
  const rows = await recRepo.recentConfidenceScores(orgId, 20);
  return rows.map((r) => r.confidenceScore);
}
