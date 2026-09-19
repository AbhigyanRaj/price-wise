import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/generated/**",
      // Design handoff: a self-contained HTML prototype and its runtime,
      // supplied as a visual reference to reimplement rather than as source to
      // ship. Linting someone else's prototype tells us nothing.
      "new-design/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // Express identifies an error handler by its 4-argument arity, so the
      // unused `next` parameter is load-bearing and cannot be deleted.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },

  // Engineering rule R1: the repository layer is the only place a database query
  // is constructed. That is what makes "every query is tenant-scoped" auditable
  // rather than an unverifiable claim, so it is enforced mechanically, not by
  // code review. Note Prisma 7 changed the import specifier: the client is now
  // generated into the source tree, so the old "@prisma/client" ban is not enough.
  {
    files: ["apps/backend/src/**/*.ts"],
    ignores: ["apps/backend/src/repositories/**", "apps/backend/src/lib/prisma.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@prisma/client",
              message: "Query only from src/repositories, see CLAUDE.md R1.",
            },
          ],
          patterns: [
            "**/lib/prisma",
            "**/generated/prisma",
            "**/generated/prisma/**",
          ],
        },
      ],
    },
  },

  // Engineering rule R6: only lib/env.ts reads process.env. A missing secret must
  // crash at boot with a named variable, not fail mysteriously on first request.
  {
    files: ["apps/backend/src/**/*.ts"],
    ignores: ["apps/backend/src/lib/env.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read configuration from lib/env.ts, see CLAUDE.md R6.",
        },
      ],
    },
  },
);
