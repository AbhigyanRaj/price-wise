import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@pricewise/shared";
import { env } from "./env";

// Two separate secrets, deliberately. If the access secret leaks an attacker can
// forge 15-minute tokens; they still cannot mint refresh tokens or extend a
// session beyond the access TTL. Blast radius, not paranoia.
const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

const ISSUER = "pricewise-api";
const AUDIENCE = "pricewise-web";

export interface AccessClaims {
  sub: string; // userId
  orgId: string;
  role: Role;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ orgId: claims.orgId, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  // Issuer and audience are checked, not just the signature: a token minted by
  // some other service sharing the secret must not be accepted here.
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (!payload.sub || typeof payload.orgId !== "string" || typeof payload.role !== "string") {
    throw new Error("Malformed access token claims");
  }

  return {
    sub: payload.sub,
    orgId: payload.orgId,
    role: payload.role as Role,
  };
}

export async function signRefreshToken(userId: string, tokenId: string): Promise<string> {
  return new SignJWT({ jti: tokenId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(`${env.REFRESH_TOKEN_TTL_DAYS}d`)
    .sign(refreshSecret);
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string; jti: string }> {
  const { payload } = await jwtVerify(token, refreshSecret, { issuer: ISSUER });

  if (!payload.sub || typeof payload.jti !== "string") {
    throw new Error("Malformed refresh token claims");
  }

  return { sub: payload.sub, jti: payload.jti };
}

// Refresh tokens are stored as a hash, never in plaintext: a database leak must
// not hand over usable sessions. sha256 is sufficient here because the token is
// already high-entropy, this is not a password.
export function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}
