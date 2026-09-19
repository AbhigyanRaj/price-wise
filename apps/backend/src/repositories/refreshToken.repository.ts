import { prisma } from "../lib/prisma";

export function create(data: {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}) {
  return prisma.refreshToken.create({ data });
}

export function findByHash(tokenHash: string) {
  return prisma.refreshToken.findUnique({ where: { tokenHash } });
}

export function markRotated(id: string, replacedById: string) {
  return prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date(), replacedById },
  });
}

export function revoke(id: string) {
  return prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
}

// Used on reuse detection: one stolen token burns the whole chain for that user.
export function revokeAllForUser(userId: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
