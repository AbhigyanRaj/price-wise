import type { Response } from "express";
import { env } from "./env";

// One place decides cookie flags, so a security property is not re-derived at
// each call site.
//
// Production splits the browser origin (Vercel) from the API origin (Render),
// which makes every auth cookie cross-site. SameSite=Lax is not sent on a
// cross-site XHR, so login would appear to succeed and every request after it
// would 401. Production therefore needs SameSite=None, and a browser accepts
// None only together with Secure.
//
// Both derive from the single COOKIE_SECURE flag rather than from NODE_ENV,
// because "is this cookie cross-site" and "is this cookie Secure" are the same
// underlying fact here: HTTPS across two origins. One flag makes the invalid
// combination, None without Secure, which every browser silently discards,
// unrepresentable. It also keeps local HTTP development on Lax with no second
// variable to forget.
//
// `partitioned` (CHIPS) rides along because Chrome blocks unpartitioned
// third-party cookies in Incognito, which is exactly how a reviewer opens a
// link. A partitioned cookie is keyed to the top-level site, which is the only
// context this is ever used from. Browsers that do not know the attribute
// ignore it.
const base = {
  httpOnly: true as const,
  secure: env.COOKIE_SECURE,
  sameSite: (env.COOKIE_SECURE ? "none" : "lax") as "none" | "lax",
  partitioned: env.COOKIE_SECURE,
  // No `domain` attribute, deliberately. In production the API is on
  // *.onrender.com, which is on the Public Suffix List, browsers reject a
  // Domain attribute there. Omitting it makes the cookie host-only, which is
  // what we want. Established in Phase 0.0.
};

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;

export function setAuthCookies(res: Response, access: string, refresh: string) {
  res.cookie("access_token", access, { ...base, path: "/", maxAge: ACCESS_MAX_AGE_MS });

  // Scoped to the one route that consumes it, so the refresh token is not
  // transmitted on every ordinary API call, a smaller window for interception.
  res.cookie("refresh_token", refresh, {
    ...base,
    path: "/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("access_token", { ...base, path: "/" });
  res.clearCookie("refresh_token", { ...base, path: "/auth" });
}
