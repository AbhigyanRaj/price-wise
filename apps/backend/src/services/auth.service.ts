import type { LoginInput, Role, SignupInput } from "@pricewise/shared";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { hashPassword, verifyPassword } from "../lib/password";
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { env } from "../lib/env";
import * as userRepo from "../repositories/user.repository";
import * as orgRepo from "../repositories/organization.repository";
import * as refreshRepo from "../repositories/refreshToken.repository";

// A real argon2id hash of a random string, computed once at boot. Login against
// a nonexistent email verifies against this instead of returning early, so the
// response time does not reveal whether an address is registered (FR-AUTH-10).
const DUMMY_HASH = await hashPassword(crypto.randomUUID());

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

interface TokenSubject {
  id: string;
  organizationId: string;
  role: Role;
}

async function issueTokenPair(user: TokenSubject) {
  const tokenId = crypto.randomUUID();
  const refresh = await signRefreshToken(user.id, tokenId);

  await refreshRepo.create({
    id: tokenId,
    // Stored as a hash, never plaintext: a database leak must not hand over
    // usable sessions.
    tokenHash: hashToken(refresh),
    userId: user.id,
    expiresAt: addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS),
  });

  const access = await signAccessToken({
    sub: user.id,
    orgId: user.organizationId,
    role: user.role,
  });

  return { access, refresh, tokenId };
}

/** Exposed so invite redemption can log the new member in without duplicating
 *  token-issuing logic. */
export async function issueTokensFor(user: TokenSubject) {
  return issueTokenPair(user);
}

export async function signup(input: SignupInput, ip?: string) {
  const existing = await userRepo.findByEmail(input.email);
  if (existing) {
    throw new AppError("EMAIL_IN_USE", "An account with that email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  // The transaction lives in the repository: an organization without an admin,
  // or an admin without an organization, are both invalid states that must
  // never be observable, and repositories are the only layer allowed to
  // construct queries (rule R1).
  const { user, organization } = await orgRepo.createWithAdmin({
    organizationName: input.organizationName,
    email: input.email,
    passwordHash,
    name: input.name,
    ipAddress: ip ?? null,
  });

  const tokens = await issueTokenPair(user);
  return { user, organization, tokens };
}

export async function login(input: LoginInput) {
  const user = await userRepo.findByEmailWithOrg(input.email);

  // Always run a verification, even when the user does not exist, so timing
  // does not distinguish "no such account" from "wrong password".
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(hash, input.password);

  if (!user || !passwordOk) {
    throw new AppError("UNAUTHENTICATED", "Invalid email or password");
  }

  const tokens = await issueTokenPair(user);
  return { user, organization: user.organization, tokens };
}

export async function refresh(presentedToken: string) {
  // Signature and expiry first, a forged token never reaches the database.
  await verifyRefreshToken(presentedToken);

  const stored = await refreshRepo.findByHash(hashToken(presentedToken));
  if (!stored) {
    throw new AppError("REFRESH_INVALID", "Session expired, please sign in again");
  }

  // Theft detection. The token is validly signed and known, but was already
  // rotated away. A refresh token is legitimately usable exactly once, so a
  // second use means two parties hold it, either a replay by a flaky client or
  // a stolen token. Either way the whole chain burns.
  if (stored.revokedAt) {
    await refreshRepo.revokeAllForUser(stored.userId);
    logger.warn({ userId: stored.userId }, "refresh token reuse detected, chain revoked");
    throw new AppError("REFRESH_INVALID", "Session invalidated, please sign in again");
  }

  if (stored.expiresAt < new Date()) {
    throw new AppError("REFRESH_INVALID", "Session expired, please sign in again");
  }

  const user = await userRepo.findByIdWithOrg(stored.userId);
  if (!user) throw new AppError("REFRESH_INVALID", "Session invalid");

  const next = await issueTokenPair(user);
  await refreshRepo.markRotated(stored.id, next.tokenId);

  return { user, organization: user.organization, tokens: next };
}

export async function logout(presentedToken: string | undefined) {
  if (!presentedToken) return;

  const stored = await refreshRepo.findByHash(hashToken(presentedToken));
  // Logout is idempotent: an already-revoked or unknown token is not an error,
  // because the caller's intent, end the session, is already satisfied.
  if (stored && !stored.revokedAt) {
    await refreshRepo.revoke(stored.id);
  }
}
