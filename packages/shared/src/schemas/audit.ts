import { z } from "zod";

export const AuditQuerySchema = z.object({
  entityType: z.string().max(64).optional(),
  entityId: z.uuid().optional(),
  userId: z.uuid().optional(),
  action: z.string().max(64).optional(),
  /** Free text across action, entityType and entityId.
   *
   *  Deliberately NOT across the actor's name: AuditLog has no relation to
   *  User, only to Organization, so matching a person would need a schema
   *  change. Nor across beforeValue/afterValue: Prisma cannot do a whole
   *  document contains on a Json column without raw SQL. The UI says so in
   *  the placeholder rather than overclaiming. */
  search: z.string().trim().max(200).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;
