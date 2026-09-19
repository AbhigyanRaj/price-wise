import type { AuditQuery } from "@pricewise/shared";
import * as auditRepo from "../repositories/audit.repository";
import * as auditQueryRepo from "../repositories/audit.query.repository";
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
export function listAuditLogs(orgId: string, q: AuditQuery) {
  return auditQueryRepo.findMany(orgId, q);
}

export async function listActions(orgId: string): Promise<string[]> {
  const rows = await auditQueryRepo.distinctActions(orgId);
  return rows.map((r) => r.action);
}
