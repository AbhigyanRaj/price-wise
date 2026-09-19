import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";
import { errorEnvelope, fromAppError } from "../lib/envelope";
import { logger } from "../lib/logger";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json(errorEnvelope("NOT_FOUND", "Route not found"));
}

// The single exit point for every error in the application (rule R5).
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ requestId: req.requestId, err }, err.message);
    else logger.info({ requestId: req.requestId, code: err.code }, err.message);
    res.status(err.status).json(fromAppError(err));
    return;
  }

  logger.error({ requestId: req.requestId, err }, "unhandled error");

  // No stack trace reaches the client, but the correlation id does, so a
  // user-reported failure can be found in the logs immediately.
  res.status(500).json(
    errorEnvelope("INTERNAL_ERROR", `Unexpected error. Reference: ${req.requestId}`),
  );
}
