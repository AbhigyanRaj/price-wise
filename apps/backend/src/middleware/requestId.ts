import type { NextFunction, Request, Response } from "express";

// First middleware in the chain, so every later log line and every error
// response can carry the same correlation id (rule R8).
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
