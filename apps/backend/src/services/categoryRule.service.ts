import type { CategoryRuleInput } from "@pricewise/shared";
import { AppError, notFound } from "../lib/errors";
import * as categoryRuleRepo from "../repositories/categoryRule.repository";
import * as productRepo from "../repositories/product.repository";
import * as auditService from "./audit.service";

/**
 * Per-category pricing limits.
 *
 * The table and its schema existed from the start and nothing exposed them, so
 * an admin could not set a category floor even though the pipeline already
 * read one.
 */

export function listRules(orgId: string) {
  return categoryRuleRepo.listForOrg(orgId);
}

/**
 * The single definition of "what limits apply to this product".
 *
 * Two things were wrong with the version this replaces. It was copy-pasted
 * into three call sites, which is a business rule with three homes. And it
 * used `categoryRule?.marginFloorPct ?? product.marginFloorPct`, so a category
 * rule OVERRODE the product: setting a 10% floor on Electronics silently
 * *lowered* the floor on a product configured at 25%, and the exact thing this
 * product exists to prevent got weaker because someone edited a settings page.
 *
 * A category rule now tightens and never loosens. It cannot grant a licence to
 * sell thinner than the product's own floor, and it cannot widen the
 * organization's maximum price move.
 */
export function effectiveLimits(
  rule: { marginFloorPct: number; maxDeltaPct: number } | null,
  fallback: { marginFloorPct: number; maxDeltaPct: number },
): { marginFloorPct: number; maxDeltaPct: number } {
  if (!rule) return fallback;
  return {
    marginFloorPct: Math.max(rule.marginFloorPct, fallback.marginFloorPct),
    maxDeltaPct: Math.min(rule.maxDeltaPct, fallback.maxDeltaPct),
  };
}

/** Resolves the limits for one product, reading the rule itself. */
export async function limitsForProduct(
  orgId: string,
  product: { category: string; marginFloorPct: number },
  orgMaxDeltaPct: number,
) {
  const rule = await categoryRuleRepo.findForCategory(orgId, product.category);
  return effectiveLimits(rule, {
    marginFloorPct: product.marginFloorPct,
    maxDeltaPct: orgMaxDeltaPct,
  });
}

export async function upsertRule(orgId: string, actorId: string, input: CategoryRuleInput) {
  // A rule for a category with no products is invisible dead configuration,
  // and a typo is the likeliest way to create one.
  const rows = await productRepo.listCategories(orgId);
  if (!rows.some((row) => row.category === input.category)) {
    throw new AppError("VALIDATION_ERROR", "No products in this organization use that category", {
      fieldErrors: { category: [`"${input.category}" does not match any product category`] },
    });
  }

  const before = await categoryRuleRepo.findForCategory(orgId, input.category);
  const rule = await categoryRuleRepo.upsert(orgId, input);

  await auditService.record({
    orgId,
    userId: actorId,
    action: before ? "CATEGORY_RULE_UPDATED" : "CATEGORY_RULE_CREATED",
    entityType: "CategoryRule",
    entityId: rule.id,
    ...(before
      ? {
          beforeValue: {
            marginFloorPct: before.marginFloorPct,
            maxDeltaPct: before.maxDeltaPct,
          },
        }
      : {}),
    afterValue: { marginFloorPct: rule.marginFloorPct, maxDeltaPct: rule.maxDeltaPct },
  });

  return rule;
}

export async function deleteRule(orgId: string, actorId: string, category: string) {
  const before = await categoryRuleRepo.findForCategory(orgId, category);
  // 404 rather than 403 for another org's category, same as everywhere else.
  if (!before) throw notFound("Category rule");

  await categoryRuleRepo.remove(orgId, category);

  await auditService.record({
    orgId,
    userId: actorId,
    action: "CATEGORY_RULE_DELETED",
    entityType: "CategoryRule",
    entityId: before.id,
    beforeValue: { marginFloorPct: before.marginFloorPct, maxDeltaPct: before.maxDeltaPct },
  });
}
