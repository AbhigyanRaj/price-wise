import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { unauthenticated } from "../lib/errors";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.access_token as string | undefined;
  if (!token) return next(unauthenticated());

  try {
    const claims = await verifyAccessToken(token);
    req.ctx = { userId: claims.sub, orgId: claims.orgId, role: claims.role };
    next();
  } catch {
    // Deliberately not distinguishing expired from malformed from forged: the
    // client's correct response is the same in all three cases.
    next(unauthenticated("Session expired"));
  }
}
