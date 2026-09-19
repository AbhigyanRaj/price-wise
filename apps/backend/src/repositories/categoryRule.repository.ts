import { prisma } from "../lib/prisma";

export function findForCategory(orgId: string, category: string) {
  return prisma.categoryRule.findUnique({
    where: { organizationId_category: { organizationId: orgId, category } },
  });
}

export function listForOrg(orgId: string) {
  return prisma.categoryRule.findMany({
    where: { organizationId: orgId },
    orderBy: { category: "asc" },
  });
}

export function upsert(
  orgId: string,
  rule: { category: string; marginFloorPct: number; maxDeltaPct: number },
) {
  return prisma.categoryRule.upsert({
    where: { organizationId_category: { organizationId: orgId, category: rule.category } },
    create: { ...rule, organizationId: orgId },
    update: { marginFloorPct: rule.marginFloorPct, maxDeltaPct: rule.maxDeltaPct },
  });
}

export async function remove(orgId: string, category: string): Promise<boolean> {
  const result = await prisma.categoryRule.deleteMany({
    where: { organizationId: orgId, category },
  });
  return result.count > 0;
}
