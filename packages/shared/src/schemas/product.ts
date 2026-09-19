import { z } from "zod";

export const InventoryStatusSchema = z.enum(["LOW", "NORMAL", "OVERSTOCKED"]);

export const ProductInputSchema = z
  .object({
    sku: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Z0-9-]+$/i, "SKU may contain letters, digits and hyphens"),
    name: z.string().min(1).max(200),
    category: z.string().min(1).max(64),
    currentPrice: z.number().positive().max(1_000_000),
    cost: z.number().positive().max(1_000_000),
    marginFloorPct: z.number().min(0).max(0.95),
    inventoryLevel: z.number().int().min(0),
  })
  // Genuine business logic, not a format check: selling below cost is the single
  // outcome this product exists to prevent, so it is rejected at the boundary.
  .refine((v) => v.currentPrice > v.cost, {
    error: "Current price must exceed cost",
    path: ["currentPrice"],
  });

// Declared explicitly rather than derived with .partial(): ProductInputSchema
// carries a cross-field refinement, and .partial() cannot be called on a refined
// schema. The price-exceeds-cost rule is re-checked in the service on update,
// where the merged before/after values are both available.
export const ProductPatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    category: z.string().min(1).max(64).optional(),
    currentPrice: z.number().positive().max(1_000_000).optional(),
    cost: z.number().positive().max(1_000_000).optional(),
    marginFloorPct: z.number().min(0).max(0.95).optional(),
    inventoryLevel: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");

export const ProductQuerySchema = z.object({
  category: z.string().max(64).optional(),
  inventoryStatus: InventoryStatusSchema.optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(["name", "currentPrice", "inventoryLevel", "updatedAt"]).default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const MarketEventSchema = z.object({
  eventType: z.enum([
    "competitor_price_drop",
    "competitor_price_increase",
    "demand_spike",
    "new_competitor",
  ]),
  magnitudePct: z.number().min(-90).max(300).optional(),
});

export const IdParamSchema = z.object({ productId: z.uuid() });

export type InventoryStatus = z.infer<typeof InventoryStatusSchema>;
export type ProductInput = z.infer<typeof ProductInputSchema>;
export type ProductPatch = z.infer<typeof ProductPatchSchema>;
export type ProductQuery = z.infer<typeof ProductQuerySchema>;
export type MarketEvent = z.infer<typeof MarketEventSchema>;
