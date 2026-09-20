import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Loads apps/backend/.env for the Prisma CLI.
 *
 * This is not belt-and-braces; without it the documented setup does not work.
 * Three facts combine:
 *
 *   1. Prisma 7 with a prisma.config.ts does NOT auto-load .env the way the
 *      old schema-based datasource block did.
 *   2. `bun run <script>` does NOT inject .env into the process it spawns.
 *      Only the Bun *runtime* does. So `bun run db:migrate` reaches the Prisma
 *      CLI with none of the file's variables set.
 *   3. The CLI is Node, which does not read .env on its own either.
 *
 * The result was that `cp .env.example .env`, the single setup step the README
 * gives, had no effect on any Prisma command: migrate, deploy, reset and studio
 * all fell through to the placeholder below and failed with P1001 against a
 * host that does not exist. It went unnoticed because `db:seed` and `dev` run
 * on the Bun runtime, which does load the file, and because CI never runs
 * migrate.
 *
 * Deliberately hand-rolled rather than pulling in dotenv: it is twelve lines,
 * it runs before any dependency graph is resolved, and a setup path this
 * load-bearing should not acquire a package to work.
 *
 * Real environment variables always win, so CI and a deployed host, which set
 * them directly and ship no .env, are unaffected.
 */
function loadEnvFile(): void {
  try {
    const contents = readFileSync(resolve(import.meta.dirname, ".env"), "utf8");
    for (const line of contents.split("\n")) {
      const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
      if (!match?.[1]) continue;
      const key = match[1];
      if (process.env[key] !== undefined) continue;
      // Strip one layer of matching quotes, which is all a .env ever needs.
      process.env[key] = (match[2] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {
    // No .env is a legitimate state: CI, Docker and any deployed host set real
    // environment variables instead.
  }
}

loadEnvFile();

// Prisma 7 moved the datasource URL out of schema.prisma into this file.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Read by the Prisma CLI only: migrate, studio, db pull. The running
    // application never uses this; it builds its own pg pool from DATABASE_URL
    // in src/lib/prisma.ts.
    //
    // Migrations run over DIRECT_URL, Supabase's session-mode connection.
    // `prisma migrate deploy` takes a Postgres advisory lock and issues DDL,
    // and neither survives pgbouncer transaction pooling, so pointing this at
    // the pooled DATABASE_URL breaks migrations on Supabase while looking
    // perfectly fine against a local single-connection Postgres.
    //
    // `||` rather than `??` so an empty string also falls through, matching how
    // src/lib/env.ts normalises it.
    //
    // Not a rule R6 violation: the lint rule scopes to apps/backend/src.
    //
    // The placeholder covers exactly one case: `prisma generate`, which is
    // evaluated through this same config but needs no database at all. Without
    // it, `bun install && bun run db:generate` is impossible on a fresh clone.
    // Any command that actually connects still fails, and it fails naming the
    // variable, because that is the host it tries to reach.
    url:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL ||
      "postgresql://user:pass@set-DATABASE_URL-before-connecting:5432/db",
  },
  migrations: {
    path: "prisma/migrations",
    seed: "bun run src/scripts/seed.ts",
  },
});
