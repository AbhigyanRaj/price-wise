import type { NextFunction, Request, Response } from "express";
import { unauthenticated } from "../lib/errors";
import { logger } from "../lib/logger";

// The acting organization comes only from the verified token. A client-supplied
// organizationId is stripped and its presence logged as suspicious (MT-2).
export function tenantScope(req: Request, _res: Response, next: NextFunction) {
  if (!req.ctx) return next(unauthenticated());

  const inBody =
    req.body && typeof req.body === "object" && "organizationId" in (req.body as object);
  const inQuery = "organizationId" in req.query;

  if (inBody || inQuery) {
    logger.warn(
      { requestId: req.requestId, userId: req.ctx.userId, path: req.path },
      "client supplied organizationId, ignored",
    );
    if (inBody) delete (req.body as Record<string, unknown>).organizationId;
    if (inQuery) delete (req.query as Record<string, unknown>).organizationId;
  }

  next();
}
