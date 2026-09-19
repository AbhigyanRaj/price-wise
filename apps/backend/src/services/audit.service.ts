import * as auditRepo from "../repositories/audit.repository";
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
