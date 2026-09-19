import type { Prisma } from "../generated/prisma/client";
import type { AuditQuery } from "@pricewise/shared";
import { prisma } from "../lib/prisma";

/** Reads live separately from audit writes: the write path must never grow an
 *  update or delete by accident, and keeping the query side apart makes that
 *  boundary visible (FR-AUD-3). */
export async function findMany(orgId: string, q: AuditQuery) {
  const where: Prisma.AuditLogWhereInput = {
    organizationId: orgId,
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            // Inclusive at both bounds, a filter for "today" must include
            // events at 00:00:00 and 23:59:59.
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;

  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, hasMore };
}

export function distinctActions(orgId: string) {
  return prisma.auditLog.findMany({
    where: { organizationId: orgId },
    select: { action: true },
    distinct: ["action"],
    orderBy: { action: "asc" },
  });
}
