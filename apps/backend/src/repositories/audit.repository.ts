import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import type { JsonValue } from "../lib/json";

export interface CreateAuditInput {
  orgId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeValue?: JsonValue;
  afterValue?: JsonValue;
  ipAddress?: string | null;
}

/** Maps our structural JsonValue onto Prisma's input type at the one boundary
 *  where it matters, so no other layer needs to know Prisma's Json types. */
function toPrismaJson(value: JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function create(entry: CreateAuditInput, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  return client.auditLog.create({
    data: {
      organizationId: entry.orgId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.beforeValue !== undefined ? { beforeValue: toPrismaJson(entry.beforeValue) } : {}),
      ...(entry.afterValue !== undefined ? { afterValue: toPrismaJson(entry.afterValue) } : {}),
      ipAddress: entry.ipAddress ?? null,
    },
  });
}
