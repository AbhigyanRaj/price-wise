import type { Response } from "express";
import { env } from "./env";

// One place decides cookie flags, so a security property is not re-derived at
// each call site.
const base = {
  httpOnly: true as const,
  secure: env.COOKIE_SECURE,
  sameSite: "lax" as const,
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
