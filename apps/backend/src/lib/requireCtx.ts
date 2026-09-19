import type { Request } from "express";
import { unauthenticated } from "./errors";

/** Narrows req.ctx for handlers behind requireAuth, so `req.ctx!` never appears. */
export function requireCtx(req: Request) {
  if (!req.ctx) throw unauthenticated();
  return req.ctx;
}
