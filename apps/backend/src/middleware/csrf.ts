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

  // Its own code, not FORBIDDEN_ROLE. Both are 403, but a client that reads
  // the code cannot otherwise tell "your role is insufficient" apart from "you
  // forgot a header", and only one of those is worth retrying.
  next(
    new AppError(
      "CSRF_REQUIRED",
      `Missing ${REQUIRED_HEADER} header. State-changing requests must send it; a cross-site form cannot.`,
    ),
  );
}
