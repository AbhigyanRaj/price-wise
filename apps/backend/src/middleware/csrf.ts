import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REQUIRED_HEADER = "x-pricewise-client";

// Cookie auth means the browser attaches credentials automatically, so a
// cross-site form post would otherwise be authenticated. A cross-site HTML form
// cannot set a custom header, so requiring one rejects forged submissions
// before they reach a handler. This matters more in production, where
// SameSite=None is required for the cross-site Vercel/Render split.
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.header(REQUIRED_HEADER)) return next();

  next(new AppError("FORBIDDEN_ROLE", "Missing client header"));
}
