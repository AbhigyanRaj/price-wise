import { prisma } from "../../src/lib/prisma";

/** Truncates every table between tests so each one starts from a known state
 *  and the suite is order-independent. RESTART IDENTITY CASCADE also clears
 *  dependent rows, which matters because most tables cascade from Organization. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`;

  if (tables.length === 0) return;

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export { prisma };
