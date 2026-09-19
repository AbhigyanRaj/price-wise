import { AppError, notFound } from "../lib/errors";
import { logger } from "../lib/logger";
import * as productRepo from "../repositories/product.repository";
import * as orgRepo from "../repositories/organization.repository";
import * as recRepo from "../repositories/recommendation.repository";
import { limitsForProduct } from "./categoryRule.service";
import * as auditService from "./audit.service";
import { checkBusinessRules, hasBlockingViolation } from "./businessRules";
import * as mockPlatform from "./mockPlatform.service";

export interface ExecutionResult {
  executed: boolean;
  platformRef: string;
}

/**
 * Pushes a price to the platform, rolling the local value back if the platform
 * rejects it. The local write happens first and is reverted on failure, so the
 * database never claims a price the storefront does not actually have.
 *
 * `actorId` is null for an auto-execution, that is how the audit trail
 * distinguishes a system action from a human approval (FR-AUD-8).
 */
export async function executeRecommendation(
  orgId: string,
  recommendationId: string,
  price: number,
  actorId: string | null,
): Promise<ExecutionResult> {
  const rec = await recRepo.findById(orgId, recommendationId);
  if (!rec) throw notFound("Recommendation");

  const product = await productRepo.findById(orgId, rec.productId);
  if (!product) throw notFound("Product");

  const org = await orgRepo.findById(orgId);
  if (!org) throw notFound("Organization");

  const limits = await limitsForProduct(
    orgId,
    { category: product.category, marginFloorPct: product.marginFloorPct },
    org.maxPriceDeltaPct,
  );
  const previousPrice = Number(product.currentPrice);

  // The last deterministic gate before money is affected. The agents have
  // already approved, but this runs regardless, so even a compromised or
  // hallucinating agent cannot push a below-floor price, and neither can a
  // hand-crafted request that bypassed the UI entirely.
  const violations = checkBusinessRules(price, {
    currentPrice: previousPrice,
    cost: Number(product.cost),
    marginFloorPct: limits.marginFloorPct,
    maxDeltaPct: limits.maxDeltaPct,
  });

  if (hasBlockingViolation(violations)) {
    throw new AppError("EXECUTION_FAILED", "Blocked by business rules", {
      violations: violations.filter((v) => v.severity === "block"),
    });
  }

  await productRepo.updatePrice(orgId, product.id, price);

  try {
    const platformResult = await mockPlatform.updatePlatformPrice(product.sku, price);

    await recRepo.recordExecution({
      recommendationId,
      attemptedPrice: price,
      succeeded: true,
      platformResponse: { ...platformResult },
      rolledBack: false,
    });

    await auditService.record({
      orgId,
      userId: actorId,
      action: actorId ? "PRICE_APPROVED_AND_EXECUTED" : "PRICE_AUTO_EXECUTED",
      entityType: "Product",
      entityId: product.id,
      beforeValue: { price: previousPrice },
      afterValue: { price, platformRef: platformResult.platformRef },
    });

    return { executed: true, platformRef: platformResult.platformRef };
  } catch (err) {
    // Roll the local write back, so the database and the platform agree.
    await productRepo.updatePrice(orgId, product.id, previousPrice);

    await recRepo.recordExecution({
      recommendationId,
      attemptedPrice: price,
      succeeded: false,
      platformResponse: { error: err instanceof Error ? err.message : String(err) },
      rolledBack: true,
    });

    await auditService.record({
      orgId,
      userId: actorId,
      action: "PRICE_EXECUTION_FAILED",
      entityType: "Product",
      entityId: product.id,
      beforeValue: { price: previousPrice },
      afterValue: { attemptedPrice: price, rolledBack: true },
    });

    // Log the real cause. The try block covers the platform call, the execution
    // record and the audit write, so a database failure in either of the last
    // two used to surface as "Platform rejected the price update", which sends
    // the next person debugging it at the wrong system entirely.
    logger.warn(
      { recommendationId, price, err },
      "price execution failed, local write rolled back",
    );

    // The client message stays generic on purpose: it is the honest summary of
    // what the user needs to know, and the detail belongs in the log rather
    // than in a response body.
    throw new AppError("EXECUTION_FAILED", "The price change could not be completed; it has been rolled back", {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}
