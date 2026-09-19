import { z } from "zod";

export const RecStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "MODIFIED",
  "AUTO_EXECUTED",
  "FAILED",
]);

export const RecommendationQuerySchema = z.object({
  status: RecStatusSchema.optional(),
  productId: z.uuid().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  // Cursor, not offset: the queue grows while it is being read, and offset
  // paging would re-show rows that shifted down a page.
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// A blank reason is worthless to the feedback loop that resurfaces it on future
// recommendations for the same product, so a minimum length is enforced.
export const RejectSchema = z.object({
  reason: z.string().min(10).max(500).trim(),
});

export const ModifySchema = z.object({
  modifiedPrice: z.number().positive().max(1_000_000),
});

export const RecommendationIdParamSchema = z.object({ recommendationId: z.uuid() });

export type RecommendationQuery = z.infer<typeof RecommendationQuerySchema>;
export type RecStatus = z.infer<typeof RecStatusSchema>;

/** Bounded deliberately. Each id pushes a price to an external platform, so an
 *  unbounded list is an unbounded number of outbound calls held open on one
 *  request. Fifty is a full queue page and then some. */
export const BatchApproveSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
});

export type BatchApproveInput = z.infer<typeof BatchApproveSchema>;
