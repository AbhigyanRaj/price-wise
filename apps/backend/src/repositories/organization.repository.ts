import { prisma } from "../lib/prisma";
import * as auditRepo from "./audit.repository";

export function findById(orgId: string) {
  return prisma.organization.findUnique({ where: { id: orgId } });
}

// `| undefined` is explicit rather than using Partial<>: under
// exactOptionalPropertyTypes an absent key and a key set to undefined are
// different types, and Zod's .optional() produces the latter. Prisma treats
// both as "leave this column alone", so accepting undefined is correct here.
export function update(
  orgId: string,
  data: {
    name?: string | undefined;
    confidenceThreshold?: number | undefined;
    maxPriceDeltaPct?: number | undefined;
  },
) {
  // Only keys that were actually supplied are sent. An absent field means
  // "leave this column alone", and building the payload this way states that
  // explicitly instead of relying on Prisma's undefined handling, which
  // exactOptionalPropertyTypes rejects anyway.
  return prisma.organization.update({
    where: { id: orgId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.confidenceThreshold !== undefined
        ? { confidenceThreshold: data.confidenceThreshold }
        : {}),
      ...(data.maxPriceDeltaPct !== undefined ? { maxPriceDeltaPct: data.maxPriceDeltaPct } : {}),
    },
  });
}

/** Creates an organization, its first ADMIN, and the audit row in ONE
 *  transaction. An organization without an admin, or an admin without an
 *  organization, are both invalid states that must never be observable.
 *  The transaction lives here rather than in the service because repositories
 *  are the only layer permitted to construct queries (rule R1). */
export async function createWithAdmin(input: {
  organizationName: string;
  email: string;
  passwordHash: string;
  name: string;
  ipAddress?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: input.organizationName },
    });

    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
        role: "ADMIN",
        organizationId: organization.id,
      },
    });

    await auditRepo.create(
      {
        orgId: organization.id,
        userId: user.id,
        action: "ORG_CREATED",
        entityType: "Organization",
        entityId: organization.id,
        afterValue: { name: organization.name },
        ipAddress: input.ipAddress ?? null,
      },
      tx,
    );

    return { user, organization };
  });
}
