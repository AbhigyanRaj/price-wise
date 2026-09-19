import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the datasource URL out of schema.prisma into this file.
// `env()` throws on a missing variable, so a bad setup fails at command time
// naming the variable rather than as an opaque connection error.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "prisma/migrations",
    seed: "bun run src/scripts/seed.ts",
  },
});
