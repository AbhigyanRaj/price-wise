import { prisma } from "../lib/prisma";

// Repositories are the only place prisma.* appears (rule R1, lint-enforced).

export function findByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function findByEmailWithOrg(email: string) {
  return prisma.user.findUnique({ where: { email }, include: { organization: true } });
}

export function findByIdWithOrg(id: string) {
  return prisma.user.findUnique({ where: { id }, include: { organization: true } });
}

// orgId first and required (rule R2): listing members is tenant-owned, so
// omitting the scope is a compile error rather than a data leak.
export function listByOrg(orgId: string) {
  return prisma.user.findMany({
    where: { organizationId: orgId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}
