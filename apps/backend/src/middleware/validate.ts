import type { NextFunction, Request, Response } from "express";
import { z, type ZodType } from "zod";
import { AppError } from "../lib/errors";

// Handlers receive the PARSED value via req.validated, never raw req.body
// (rule R3). Parsing also applies transforms, email lowercasing, numeric
// coercion, so the handler sees normalised data.
export function validate(schemas: {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.validated = {};
      if (schemas.body) req.validated.body = schemas.body.parse(req.body);
      if (schemas.query) req.validated.query = schemas.query.parse(req.query);
      if (schemas.params) req.validated.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        // flattenError gives { formErrors, fieldErrors }, which the frontend
        // maps straight back onto the offending form inputs.
        return next(
          new AppError("VALIDATION_ERROR", "Request validation failed", z.flattenError(err)),
        );
      }
      next(err);
    }
  };
}
