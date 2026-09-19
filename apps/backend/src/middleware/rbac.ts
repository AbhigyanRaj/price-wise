import type { NextFunction, Request, Response } from "express";
import type { Role } from "@pricewise/shared";
import { forbidden, unauthenticated } from "../lib/errors";

// Server-side enforcement. The frontend hides controls the user cannot use, but
// that is UX only, hiding a button is not access control (MT-7).
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.ctx) return next(unauthenticated());
    if (!allowed.includes(req.ctx.role)) {
      return next(forbidden(`Requires one of: ${allowed.join(", ")}`));
    }
    next();
  };
}
