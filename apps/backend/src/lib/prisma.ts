import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "./env";

// Prisma 7 removed the Rust query engine, so the client cannot reach Postgres on
// its own, it is handed a pg driver adapter instead. Omitting this throws at
// construction rather than on first query.
// `connection_limit` in the connection string is a Prisma *engine* flag and is
// inert under a driver adapter, because this pool belongs to pg rather than to
// Prisma. Cap it here instead: Supabase's free transaction pooler allots a
// small pool per project, and one instance should not try to own all of it.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: 5 });

// Bun's hot reload re-evaluates modules, which would otherwise open a fresh
// connection pool per reload and exhaust Postgres' connection limit within a
// few saves. Caching on globalThis survives the reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
