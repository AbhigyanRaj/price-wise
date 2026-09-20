import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { errorEnvelope } from "../lib/envelope";
import { env } from "../lib/env";

// Keyed on IP only. The general limiter runs before authentication, so req.ctx
// is not populated yet, keying on userId here would silently fall back to IP
// anyway, which is a trap worth naming rather than inheriting.
// 600/min, not 120. Measured, not guessed: opening the dashboard fans out four
// queries, the decisions queue adds three more, and the pending-count badge
// refreshes on a 30s stale time across three surfaces. A single analyst working
// through a queue for a minute was reaching 120 and getting "Could not approve
// that" on the next click, which is a limiter denying the product rather than
// an attacker. Everyone behind one office NAT shares this key, so the headroom
// has to cover several of them at once. Brute-force protection does not live
// here, it lives on the three credential routes in auth.routes.ts.
export const generalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 600,
  // Disabled under test only. An integration suite makes hundreds of requests
  // from one address in seconds, which is indistinguishable from abuse. The
  // AUTH limiter stays active in tests, because brute-force protection is the
  // security-critical one and is asserted directly.
  skip: () => env.NODE_ENV === "test",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json(errorEnvelope("RATE_LIMITED", "Too many requests")),
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Only FAILED attempts count. Someone legitimately signing in ten times
  // should not be locked out; ten failures is a brute-force signal.
  skipSuccessfulRequests: true,
  // ipKeyGenerator normalises IPv6 to its /64 subnet. Using req.ip raw would
  // let an IPv6 client rotate through addresses it already controls and bypass
  // the limit entirely, the library refuses to start without this.
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip ?? "")}:${(req.body as { email?: string })?.email ?? ""}`,
  handler: (_req, res) =>
    res.status(429).json(errorEnvelope("RATE_LIMITED", "Too many attempts, try again later")),
});
