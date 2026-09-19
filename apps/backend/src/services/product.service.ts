import type { InventoryStatus, ProductInput, ProductPatch, ProductQuery } from "@pricewise/shared";
import { AppError, notFound } from "../lib/errors";
import * as productRepo from "../repositories/product.repository";
import * as auditService from "./audit.service";

// Thresholds live here, not in the database, so "LOW" means the same thing for
// every product and cannot drift between rows.
const INVENTORY_THRESHOLDS = { low: 20, overstocked: 400 } as const;

/** Gross margin as a fraction of price. One definition, used by the rule engine,
 *  the catalog table and the agents, so they cannot disagree. */
export function computeMargin(price: number, cost: number): number {
  if (price <= 0) return 0;
  return (price - cost) / price;
}

export function deriveInventoryStatus(level: number): InventoryStatus {
  if (level <= INVENTORY_THRESHOLDS.low) return "LOW";
  if (level >= INVENTORY_THRESHOLDS.overstocked) return "OVERSTOCKED";
  return "NORMAL";
}

/** The lowest price that still satisfies the margin floor. Computed in code and
 *  handed to the agents rather than derived by them, a wrong floor is the one
 *  error in this system that could cause a below-cost sale (rule R8). */
export function computeFloorPrice(cost: number, marginFloorPct: number): number {
  if (marginFloorPct >= 1) throw new AppError("VALIDATION_ERROR", "Margin floor must be under 100%");
  return Math.round((cost / (1 - marginFloorPct)) * 100) / 100;
}

export function listProducts(orgId: string, filters: ProductQuery) {
  return productRepo.findMany(orgId, filters);
}

export async function getProduct(orgId: string, productId: string) {
  const product = await productRepo.findById(orgId, productId);
  // 404 rather than 403: confirming the resource exists would leak another
  // tenant's id space (MT-4).
  if (!product) throw notFound("Product");
  return product;
}

export async function createProduct(orgId: string, actorId: string, input: ProductInput) {
  const existing = await productRepo.findBySku(orgId, input.sku);
  if (existing) {
    throw new AppError("CONFLICT", `SKU ${input.sku} already exists in this organization`);
  }

  const product = await productRepo.create(orgId, {
    ...input,
    // Derived, never entered by hand, so level and status cannot contradict
    // each other (D-2).
    inventoryStatus: deriveInventoryStatus(input.inventoryLevel),
  });

  await auditService.record({
    orgId,
    userId: actorId,
    action: "PRODUCT_CREATED",
    entityType: "Product",
    entityId: product.id,
    afterValue: {
      sku: product.sku,
      currentPrice: product.currentPrice.toString(),
      cost: product.cost.toString(),
    },
  });

  return product;
}

export async function updateProduct(
  orgId: string,
  actorId: string,
  productId: string,
  patch: ProductPatch,
) {
  const before = await productRepo.findById(orgId, productId);
  if (!before) throw notFound("Product");

  // The cross-field rule cannot be checked by the patch schema alone, because a
  // patch may change only one side of it. Re-check against the merged values.
  const nextPrice = patch.currentPrice ?? Number(before.currentPrice);
  const nextCost = patch.cost ?? Number(before.cost);
  if (nextPrice <= nextCost) {
    throw new AppError("VALIDATION_ERROR", "Current price must exceed cost", {
      fieldErrors: { currentPrice: ["Current price must exceed cost"] },
    });
  }

  const nextLevel = patch.inventoryLevel ?? before.inventoryLevel;

  const after = await productRepo.update(orgId, productId, {
    ...patch,
    inventoryStatus: deriveInventoryStatus(nextLevel),
  });
  if (!after) throw notFound("Product");

  await auditService.record({
    orgId,
    userId: actorId,
    action: "PRODUCT_UPDATED",
    entityType: "Product",
    entityId: productId,
    beforeValue: {
      currentPrice: before.currentPrice.toString(),
      cost: before.cost.toString(),
      inventoryLevel: before.inventoryLevel,
      marginFloorPct: before.marginFloorPct,
    },
    afterValue: {
      currentPrice: after.currentPrice.toString(),
      cost: after.cost.toString(),
      inventoryLevel: after.inventoryLevel,
      marginFloorPct: after.marginFloorPct,
    },
  });

  return after;
}

export async function deleteProduct(orgId: string, actorId: string, productId: string) {
  const before = await productRepo.findById(orgId, productId);
  if (!before) throw notFound("Product");

  const deleted = await productRepo.remove(orgId, productId);
  if (!deleted) throw notFound("Product");

  await auditService.record({
    orgId,
    userId: actorId,
    action: "PRODUCT_DELETED",
    entityType: "Product",
    entityId: productId,
    beforeValue: { sku: before.sku, name: before.name },
  });
}

export function listCategories(orgId: string) {
  return productRepo.listCategories(orgId).then((rows) => rows.map((r) => r.category));
}
