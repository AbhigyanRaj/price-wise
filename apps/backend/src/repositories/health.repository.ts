import { prisma } from "../lib/prisma";

/** Cheapest possible round-trip that proves the connection pool is alive. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
