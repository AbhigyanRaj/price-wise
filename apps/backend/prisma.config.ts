import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the datasource URL out of schema.prisma into this file.
// `env()` throws on a missing variable, so a bad setup fails at command time
// naming the variable rather than as an opaque connection error.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Read by the Prisma CLI only: migrate, studio, db pull. The running
    // application never uses this; it builds its own pg pool from DATABASE_URL
    // in src/lib/prisma.ts.
    //
    // Migrations therefore run over DIRECT_URL, Supabase's session-mode
    // connection. `prisma migrate deploy` takes a Postgres advisory lock and
    // issues DDL, and neither survives pgbouncer transaction pooling, so
    // pointing this at the pooled DATABASE_URL breaks migrations on Supabase
    // while looking perfectly fine against a local single-connection Postgres.
    //
    // process.env rather than env(), because env() throws on absence and
    // DIRECT_URL is deliberately unset locally, where DATABASE_URL is already a
    // direct connection. `||` rather than `??` so an empty string also falls
    // through, matching how src/lib/env.ts normalises it.
    //
    // Not a rule R6 violation: the lint rule scopes to apps/backend/src.
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
  migrations: {
    path: "prisma/migrations",
    seed: "bun run src/scripts/seed.ts",
  },
});
