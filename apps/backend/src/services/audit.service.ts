import type { AuditQuery } from "@pricewise/shared";
import * as auditRepo from "../repositories/audit.repository";
import * as auditQueryRepo from "../repositories/audit.query.repository";
import * as userRepo from "../repositories/user.repository";
import type { JsonValue } from "../lib/json";
import { logger } from "../lib/logger";

export interface AuditEntry {
  orgId: string;
  /** Null means the system acted, not a person, that is how an auto-executed
   *  price change is distinguished from a human approval (FR-AUD-8). */
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeValue?: JsonValue;
  afterValue?: JsonValue;
  ipAddress?: string | null;
}

export async function record(entry: AuditEntry): Promise<void> {
  try {
    await auditRepo.create(entry);
  } catch (err) {
    // An audit write must never break the operation it describes. Losing the
    // record of a successful price change is bad; rolling back that price
    // change because we failed to describe it is worse.
    logger.error({ err, entry }, "AUDIT WRITE FAILED");
  }
}

// There is deliberately no update() and no delete() here, and no route exposes
// one. Immutability is enforced by absence (FR-AUD-3).

/**
 * Reads.
 *
 * These exist because the controller was calling the query repository
 * directly, which is the one place in the app that broke the
 * route-controller-service-repository rule. Two thin functions restore it, and
 * a thin pass-through is the honest shape when a read genuinely has no
 * business logic: the alternative is a layer that lies about doing work.
 */
/**
 * Reads the page, then names the actors.
 *
 * "Who approved it" is the first thing the assessment asks an audit trail for,
 * and the UI was rendering "A teammate" because the row carries only a userId.
 * AuditLog deliberately has no relation to User: the actor is a historical
 * fact, and a foreign key would let a deleted user cascade away the record of
 * what they did. So the name is resolved here instead, from the org's own
 * members, and a userId with no surviving member stays null rather than
 * inventing one.
 *
 * One extra query per page, not per row. A tenant has a handful of members and
 * a page has at most 100 rows, so this is cheaper than a join would be.
 */
export async function listAuditLogs(orgId: string, q: AuditQuery) {
  const page = await auditQueryRepo.findMany(orgId, q);

  const actorIds = new Set(page.items.map((e) => e.userId).filter((id): id is string => id !== null));
  if (actorIds.size === 0) {
    return { ...page, items: page.items.map((e) => ({ ...e, userName: null })) };
  }

  const members = await userRepo.listByOrg(orgId);
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  return {
    ...page,
    items: page.items.map((e) => ({
      ...e,
      userName: e.userId ? (nameById.get(e.userId) ?? null) : null,
    })),
  };
}

export async function listActions(orgId: string): Promise<string[]> {
  const rows = await auditQueryRepo.distinctActions(orgId);
  return rows.map((r) => r.action);
}
