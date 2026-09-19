import { prisma } from "../lib/prisma";
import type { Role } from "@pricewise/shared";
import * as auditRepo from "./audit.repository";

export function create(data: {
  organizationId: string;
  email: string;
  role: Role;
  code: string;
  expiresAt: Date;
}) {
  return prisma.invite.create({ data });
}

export function findByCode(code: string) {
  return prisma.invite.findUnique({ where: { code } });
}

export function listOutstanding(orgId: string) {
  return prisma.invite.findMany({
    where: { organizationId: orgId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

/** Supersedes any outstanding invite for the same address, so one person never
 *  holds several simultaneously-valid codes. */
export function expireOutstanding(orgId: string, email: string) {
  return prisma.invite.updateMany({
    where: { organizationId: orgId, email, usedAt: null },
    data: { expiresAt: new Date() },
  });
}

export function findById(orgId: string, inviteId: string) {
  // orgId in the predicate, not checked afterwards: another tenant's invite is
  // simply not found, which is what makes the 404 honest.
  return prisma.invite.findFirst({ where: { id: inviteId, organizationId: orgId } });
}

export function revoke(orgId: string, inviteId: string) {
  return prisma.invite.updateMany({
    where: { id: inviteId, organizationId: orgId, usedAt: null },
    data: { expiresAt: new Date() },
  });
}

/** Redeems an invite and creates the user in ONE transaction: a consumed invite
 *  with no user, or a user whose invite is still open, are both invalid states. */
export async function redeem(input: {
  inviteId: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
}) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
        role: input.role,
        organizationId: input.organizationId,
      },
    });

    await tx.invite.update({ where: { id: input.inviteId }, data: { usedAt: new Date() } });

    await auditRepo.create(
      {
        orgId: input.organizationId,
        userId: user.id,
        action: "USER_JOINED",
        entityType: "User",
        entityId: user.id,
        afterValue: { email: user.email, role: user.role },
      },
      tx,
    );

    return user;
  });
}
