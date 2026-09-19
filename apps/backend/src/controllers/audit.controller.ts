import type { NextFunction, Request, Response } from "express";
import type { AuditQuery } from "@pricewise/shared";
import * as auditService from "../services/audit.service";
import { ok, okPaged } from "../lib/envelope";
import { requireCtx } from "../lib/requireCtx";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    const q = req.validated?.query as AuditQuery;
    const { items, nextCursor, hasMore } = await auditService.listAuditLogs(orgId, q);

    res.json(
      okPaged(
        items.map((e) => ({
          id: e.id,
          userId: e.userId,
          action: e.action,
          entityType: e.entityType,
          entityId: e.entityId,
          beforeValue: e.beforeValue,
          afterValue: e.afterValue,
          createdAt: e.createdAt.toISOString(),
        })),
        { nextCursor, hasMore },
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function actions(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    res.json(ok(await auditService.listActions(orgId)));
  } catch (err) {
    next(err);
  }
}
