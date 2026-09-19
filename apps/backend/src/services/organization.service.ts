import type { InviteCreate, InviteSignupInput, OrgSettingsPatch } from "@pricewise/shared";
import { AppError, notFound } from "../lib/errors";
import { generateInviteCode } from "../lib/inviteCode";
import { hashPassword } from "../lib/password";
import * as orgRepo from "../repositories/organization.repository";
import * as inviteRepo from "../repositories/invite.repository";
import * as userRepo from "../repositories/user.repository";
import * as auditService from "./audit.service";

const INVITE_TTL_DAYS = 7;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// Every function takes orgId as its first positional parameter (rule R2), so
// omitting the tenant scope is a compile error rather than a data leak.

export async function getSettings(orgId: string) {
  const org = await orgRepo.findById(orgId);
  if (!org) throw notFound("Organization");
  return org;
}

export async function updateSettings(orgId: string, actorId: string, patch: OrgSettingsPatch) {
  const before = await orgRepo.findById(orgId);
  if (!before) throw notFound("Organization");

  const after = await orgRepo.update(orgId, patch);

  // before/after is what makes the audit trail useful rather than decorative:
  // "who lowered the threshold, and from what" is answerable in one row.
  await auditService.record({
    orgId,
    userId: actorId,
    action: "ORG_SETTINGS_UPDATED",
    entityType: "Organization",
    entityId: orgId,
    beforeValue: {
      name: before.name,
      confidenceThreshold: before.confidenceThreshold,
      maxPriceDeltaPct: before.maxPriceDeltaPct,
    },
    afterValue: {
      name: after.name,
      confidenceThreshold: after.confidenceThreshold,
      maxPriceDeltaPct: after.maxPriceDeltaPct,
    },
  });

  return after;
}

export function listMembers(orgId: string) {
  return userRepo.listByOrg(orgId);
}

export function listInvites(orgId: string) {
  return inviteRepo.listOutstanding(orgId);
}

export async function createInvite(orgId: string, actorId: string, input: InviteCreate) {
  const existingUser = await userRepo.findByEmail(input.email);
  if (existingUser?.organizationId === orgId) {
    throw new AppError("CONFLICT", "That user is already a member of this organization");
  }

  await inviteRepo.expireOutstanding(orgId, input.email);

  const invite = await inviteRepo.create({
    organizationId: orgId,
    email: input.email,
    role: input.role,
    code: generateInviteCode(),
    expiresAt: addDays(new Date(), INVITE_TTL_DAYS),
  });

  await auditService.record({
    orgId,
    userId: actorId,
    action: "INVITE_CREATED",
    entityType: "Invite",
    entityId: invite.id,
    afterValue: { email: input.email, role: input.role },
  });

  return invite;
}

export async function revokeInvite(orgId: string, actorId: string, inviteId: string) {
  const invite = await inviteRepo.findById(orgId, inviteId);
  if (!invite) throw notFound("Invite");

  await inviteRepo.revoke(orgId, inviteId);

  await auditService.record({
    orgId,
    userId: actorId,
    action: "INVITE_REVOKED",
    entityType: "Invite",
    entityId: inviteId,
    beforeValue: { email: invite.email, expiresAt: invite.expiresAt.toISOString() },
  });
}

/** Not tenant-scoped by signature: the caller is anonymous and the organization
 *  is derived from the code itself. */
export async function redeemInvite(input: InviteSignupInput) {
  const invite = await inviteRepo.findByCode(input.inviteCode);

  // Three separate checks so the message tells the user what to do next
  // "expired" and "already used" need different responses from them.
  if (!invite) throw new AppError("INVITE_INVALID", "Invite code not recognised");
  if (invite.usedAt) throw new AppError("INVITE_INVALID", "Invite code has already been used");
  if (invite.expiresAt < new Date()) {
    throw new AppError("INVITE_INVALID", "Invite code has expired");
  }

  // The invite is bound to an address, so an intercepted code is useless without
  // also controlling that inbox, one secret becomes two factors for free.
  if (invite.email.toLowerCase() !== input.email.toLowerCase()) {
    throw new AppError("INVITE_INVALID", "This invite was issued to a different email address");
  }

  const existing = await userRepo.findByEmail(input.email);
  if (existing) throw new AppError("EMAIL_IN_USE", "An account with that email already exists");

  const passwordHash = await hashPassword(input.password);

  const user = await inviteRepo.redeem({
    inviteId: invite.id,
    organizationId: invite.organizationId,
    email: input.email,
    passwordHash,
    name: input.name,
    role: invite.role,
  });

  const organization = await orgRepo.findById(invite.organizationId);
  if (!organization) throw notFound("Organization");

  return { user, organization };
}
