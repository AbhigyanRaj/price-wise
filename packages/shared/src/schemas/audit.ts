import { z } from "zod";

export const AuditQuerySchema = z.object({
  entityType: z.string().max(64).optional(),
  entityId: z.uuid().optional(),
  userId: z.uuid().optional(),
  action: z.string().max(64).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;
