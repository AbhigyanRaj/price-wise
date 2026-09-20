import { z } from "zod";

export const AuditQuerySchema = z.object({
  entityType: z.string().max(64).optional(),
  entityId: z.uuid().optional(),
  userId: z.uuid().optional(),
  action: z.string().max(64).optional(),
  /** Free text across action, entityType and entityId.
   *
   *  Deliberately NOT across the actor's name: the name is resolved after the
   *  page is read, from the org's members, so it is not a column the database
   *  can filter on. Filter by userId instead. Nor across
   *  beforeValue/afterValue: Prisma cannot do a whole
   *  document contains on a Json column without raw SQL. The UI says so in
   *  the placeholder rather than overclaiming. */
  search: z.string().trim().max(200).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type AuditQuery = z.infer<typeof AuditQuerySchema>;
