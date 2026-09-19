import type { RecommendationQuery, RecStatus } from "@pricewise/shared";
import { AppError, notFound } from "../lib/errors";
import * as recRepo from "../repositories/recommendation.repository";
import * as productRepo from "../repositories/product.repository";
import * as orgRepo from "../repositories/organization.repository";
import { limitsForProduct } from "./categoryRule.service";
import * as auditService from "./audit.service";
import { executeRecommendation } from "./execution.service";
import { logger } from "../lib/logger";
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
    // Reads as a sentence: "already approved" beats "cannot move a APPROVED
    // recommendation to APPROVED", which is both ungrammatical and phrased
    // from the state machine's point of view rather than the user's.
    throw new AppError(
      "CONFLICT",
      existing.status === to
        ? `This recommendation is already ${to.toLowerCase().replace(/_/g, " ")}`
        : `A recommendation that is ${existing.status.toLowerCase().replace(/_/g, " ")} cannot be ${to.toLowerCase().replace(/_/g, " ")}`,
    );
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

  const limits = await limitsForProduct(
    orgId,
    { category: product.category, marginFloorPct: product.marginFloorPct },
    org.maxPriceDeltaPct,
  );

  // A human is not exempt from the rule engine. They may override the AI's
  // judgement; they may not sell below cost.
  const violations = checkBusinessRules(newPrice, {
    currentPrice: Number(product.currentPrice),
    cost: Number(product.cost),
    marginFloorPct: limits.marginFloorPct,
    maxDeltaPct: limits.maxDeltaPct,
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

/**
 * How long a decision stays reversible.
 *
 * Long enough to catch a misclick, short enough that the audit trail is the
 * record of what happened rather than a suggestion. Ten minutes is a guess
 * informed by nothing; it is a constant precisely so it is one line to change
 * when there is evidence.
 */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

/**
 * Returns a resolved recommendation to the queue.
 *
 * This deliberately softens the one-way state machine, and it is worth being
 * explicit about why. The machine is one-way so two analysts cannot both
 * resolve the same item, not because a decision is sacred. An undo does not
 * reintroduce that race: it is itself a conditional claim, so two undos
 * resolve to one winner.
 *
 * What it must not do is erase anything. The original decision keeps its audit
 * row and the reversal gets its own, so the trail reads "approved, then
 * undone" rather than silently losing the approval. A correction that hides
 * the thing it corrected is worse than no correction.
 *
 * An APPROVED or AUTO_EXECUTED recommendation already pushed a price, so the
 * undo puts the previous price back through the same execution path, including
 * its rollback. Undoing a rejection touches no price at all.
 */
export async function undo(orgId: string, actorId: string, id: string) {
  const before = await recRepo.findById(orgId, id);
  if (!before) throw new AppError("NOT_FOUND", "Recommendation not found");

  const previousStatus = before.status;
  if (previousStatus === "PENDING") {
    throw new AppError("CONFLICT", "This recommendation is already waiting for a decision");
  }

  const restored = await recRepo.claimAndUndo(orgId, id, { withinMs: UNDO_WINDOW_MS });
  if (!restored) {
    throw new AppError(
      "CONFLICT",
      "This decision can no longer be undone. It was either already undone or resolved too long ago.",
    );
  }

  // Only a status that moved a price needs the price moved back.
  const priceWasPushed = previousStatus === "APPROVED" || previousStatus === "AUTO_EXECUTED" || previousStatus === "MODIFIED";
  if (priceWasPushed) {
    await executeRecommendation(
      orgId,
      id,
      Number(before.currentPriceAtTime),
      actorId,
    ).catch((err: unknown) => {
      // The status is already back to PENDING, which is the safe place for it
      // to be. Surfacing this as a failure would be misleading: the undo
      // succeeded, the storefront push did not.
      logger.error({ err, recommendationId: id }, "undo reverted the status but not the price");
    });
  }

  await auditService.record({
    orgId,
    userId: actorId,
    action: "RECOMMENDATION_UNDONE",
    entityType: "PricingRecommendation",
    entityId: id,
    beforeValue: { status: previousStatus },
    afterValue: { status: "PENDING", restoredPrice: Number(before.currentPriceAtTime) },
  });

  return restored;
}

export interface BatchApproveResult {
  id: string;
  ok: boolean;
  error?: string;
}

/**
 * Approves several at once.
 *
 * Sequential rather than parallel, and per-item rather than transactional.
 * Each approval pushes a price to an external platform, so a transaction would
 * be a lie: the database can roll back, the storefront cannot. Running them in
 * sequence keeps the failure boundary at one item.
 *
 * Returns a result per id instead of throwing on the first failure, so eight
 * of ten succeeding is visible as exactly that rather than as an error.
 */
export async function approveMany(
  orgId: string,
  actorId: string,
  ids: string[],
): Promise<BatchApproveResult[]> {
  const results: BatchApproveResult[] = [];

  for (const id of ids) {
    try {
      await approve(orgId, actorId, id);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({
        id,
        ok: false,
        error: err instanceof AppError ? err.message : "Could not approve this recommendation",
      });
    }
  }

  return results;
}
