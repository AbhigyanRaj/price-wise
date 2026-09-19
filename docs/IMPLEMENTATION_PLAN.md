# Pricewise — Dynamic Pricing Intelligence Platform
## Implementation Plan & Engineering Rules

**Assessment:** Klypup Applied AI Intern — Technical Assessment
**Option chosen:** B — Dynamic Pricing Intelligence Dashboard
**Timeline:** 5 calendar days
**Author:** Abhigyan
**Version:** 1.0

---

## How to use this document

This document is both a **plan** and a **rulebook**. It is written so that any
step can be handed to an AI coding assistant (Cursor / Claude Code) verbatim and
produce the intended result, while leaving you able to explain every line in the
live interview — which the assessment explicitly requires.

Structure:

```
Phase N
 └── N.x   Sub-phase — a coherent unit of work, one or two commits
      └── N.x.y  Task — a single concrete action
```

Every sub-phase carries:

| Section | What it contains |
|---|---|
| **Objective** | What exists after this sub-phase that did not before |
| **Files touched** | Exact paths created or modified |
| **Implementation** | The actual approach, with code where the detail matters |
| **Acceptance criteria** | Observable, testable conditions for "done" |
| **Commit** | The commit message to use |
| **Interview note** | The question an interviewer is likely to ask about this, and the answer |

---

## Table of contents

- [Part 0 — Engineering rules (read before writing any code)](#part-0--engineering-rules)
- [Phase 0 — Repository & toolchain foundations](#phase-0--repository--toolchain-foundations)
- [Phase 1 — Data model, authentication, tenancy](#phase-1--data-model-authentication-tenancy)
- [Phase 2 — Organizations, catalog, synthetic data, frontend shell](#phase-2--organizations-catalog-synthetic-data-frontend-shell)
- [Phase 3 — The AI agent pipeline](#phase-3--the-ai-agent-pipeline)
- [Phase 4 — Approval workflow, audit trail, admin console](#phase-4--approval-workflow-audit-trail-admin-console)
- [Phase 5 — Testing, CI/CD, deployment](#phase-5--testing-cicd-deployment)
- [Phase 6 — Documentation, screenshots, presentation](#phase-6--documentation-screenshots-presentation)
- [Appendix A — Day-by-day schedule](#appendix-a--day-by-day-schedule)
- [Appendix B — Risk register](#appendix-b--risk-register)
- [Appendix C — Interview preparation checklist](#appendix-c--interview-preparation-checklist)

---

# Part 0 — Engineering rules

These rules apply to every phase. They are not suggestions. Most of the
assessment's "Architecture & Code Quality" weighting (20%) is won or lost here.

## 0.R1 — Layering rule

Code flows in exactly one direction:

```
route → controller → service → repository (Prisma)
```

- **Routes** declare the path, attach middleware, and nothing else. No logic.
- **Controllers** translate HTTP into a service call: read validated input from
  `req`, call one service function, shape the response envelope. A controller
  contains no `if` statement about business rules and never imports Prisma.
- **Services** hold all business logic. They take plain arguments (never `req`),
  return plain data (never `res`), and are therefore unit-testable without HTTP.
- **Repositories** are the only place `prisma.*` appears.

**Why this matters in the interview:** the tenant-isolation guarantee is only
auditable because there is exactly one layer where queries are constructed. If
controllers could query directly, "every query is org-scoped" would be an
unverifiable claim.

## 0.R2 — Tenant rule

> Every service function that touches a tenant-owned table takes `orgId` as its
> **first positional parameter**, typed and required.

```ts
// correct
export async function listProducts(orgId: string, filters: ProductFilters) { }

// forbidden — orgId buried in an options bag can be forgotten
export async function listProducts(opts: { filters: F; orgId?: string }) { }
```

Because `orgId` is required and positional, omitting it is a **TypeScript
compile error**, not a runtime security bug. This converts a security property
into a type-system property.

`orgId` is read **only** from the verified JWT. If a request body or query string
contains `organizationId`, it is ignored and a warning is logged.

## 0.R3 — Validation rule

Every request body, query string, and route param is parsed with a Zod schema
defined in `packages/shared`. The same schema object is imported by the frontend
for form validation and by the OpenAPI generator for the contract. One
definition, three consumers, zero drift.

Handlers receive the **parsed** value, never `req.body` directly.

## 0.R4 — Response envelope rule

Success:

```json
{ "success": true, "data": { ... }, "pagination": { ... } }
```

Failure:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { ... } } }
```

No endpoint returns a bare array or a bare string. The frontend has exactly one
unwrapping function, so a new endpoint never needs new client-side plumbing.

## 0.R5 — Error rule

Business logic throws typed `AppError` instances. A single `errorHandler`
middleware at the end of the chain maps them to status codes. No controller
contains `res.status(500)`. Unexpected exceptions are caught by the same handler,
logged with the request's correlation id, and returned as `INTERNAL_ERROR` with
that id — never a stack trace.

## 0.R6 — Secrets rule

- Every secret is read through `env.ts`, which validates `process.env` with Zod
  at boot. A missing or malformed variable **crashes the process on startup**
  with a readable message, rather than failing mysteriously on first request.
- No secret is ever referenced as `process.env.X` outside `env.ts`.
- `.env` is gitignored; `.env.example` lists every variable with a description
  and a safe placeholder.
- The frontend bundle may contain only `VITE_`-prefixed variables, and the only
  one that exists is the API base URL.

## 0.R7 — Commit rule

Conventional Commits, scoped, imperative:

```
feat(auth): issue rotating refresh tokens as httpOnly cookies
fix(tenant): reject client-supplied organizationId in product filters
test(agents): cover malformed LLM output path for strategy agent
docs(architecture): add multi-tenant data flow diagram
chore(ci): add postgres service container to test job
```

The assessment says explicitly that commit history is reviewed to understand how
you work. Commit at the end of every sub-phase, not once per day. Target 60–90
commits across the five days.

## 0.R8 — Logging rule

`pino` structured JSON logs. Every request gets a `requestId` (UUID) attached by
the first middleware and included in every log line for that request. Every agent
run logs `{ requestId, recommendationId, agentName, durationMs, promptTokens,
completionTokens }`. Never log a password, token, cookie, or full LLM prompt
containing customer data.

## 0.R9 — Testing rule

- A service function with a branch gets a unit test per branch.
- Every endpoint gets at least one integration test for the happy path and one
  for its primary failure mode.
- Every tenant-owned endpoint gets an isolation test.
- Agent code is tested with the Groq client mocked — tests must never make a
  real network call, or CI becomes flaky and expensive.

## 0.R10 — "Explain it" rule

The assessment states: *"If you can't explain it, it doesn't count."* Therefore:
when an AI assistant generates a block you do not understand, **stop and read it
before committing**. Every sub-phase below ends with an *Interview note*
precisely so you rehearse the explanation as you build, not the night before.

---

# Phase 0 — Repository & toolchain foundations

**Goal:** a repository that installs, typechecks, lints, and runs a database
locally on a clean machine, with CI proving it.

**Duration estimate:** 2.5 hours

---

## 0.1 — Repository initialization

### Objective
An empty but correctly structured Bun workspace monorepo under version control.

### Files touched
```
pricewise/
├── package.json
├── bunfig.toml
├── .gitignore
├── .nvmrc
├── README.md          (placeholder)
└── apps/
    ├── backend/package.json
    └── frontend/package.json
└── packages/
    └── shared/package.json
```

### Implementation

**0.1.1** Create the directory and initialize git.

```bash
mkdir pricewise && cd $_
git init
bun init -y
```

**0.1.2** Root `package.json` — declares the workspace and the scripts you will
use for the rest of the build.

```json
{
  "name": "pricewise",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "dev:api": "bun run --cwd apps/backend dev",
    "dev:web": "bun run --cwd apps/frontend dev",
    "build": "bun run --filter '*' build",
    "typecheck": "bun run --filter '*' typecheck",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "test": "bun run --filter '*' test",
    "test:e2e": "bun run --cwd apps/frontend test:e2e",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "db:migrate": "bun run --cwd apps/backend db:migrate",
    "db:seed": "bun run --cwd apps/backend db:seed",
    "db:reset": "bun run --cwd apps/backend db:reset",
    "db:studio": "bun run --cwd apps/backend db:studio"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "prettier": "^3.3.0",
    "eslint": "^8.57.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0"
  }
}
```

**0.1.3** `.gitignore` — the assessment calls this out explicitly as a checked item.

```gitignore
node_modules/
dist/
build/
.env
.env.local
.env.*.local
*.log
.DS_Store
coverage/
playwright-report/
test-results/
.turbo/
apps/backend/prisma/*.db
.vercel
.render
```

**0.1.4** Create the three workspace package manifests with correct names
(`@pricewise/backend`, `@pricewise/frontend`, `@pricewise/shared`) so cross-imports
resolve.

### Acceptance criteria
- `bun install` completes at the root and links all three workspaces.
- `git status` shows no `node_modules`.
- `bun run --cwd packages/shared echo ok` resolves the workspace.

### Commit
```
chore(repo): initialize bun workspace monorepo with three packages
```

### Interview note
*"Why a monorepo rather than two repos?"* — The Zod schemas in
`packages/shared` are imported by both the API and the web client. In two repos
that requires publishing a package or duplicating types; in a workspace it is a
plain import that the typechecker verifies across the boundary. The cost is a
slightly more complex build; the benefit is that a breaking API change fails at
compile time in the frontend.

---

## 0.2 — TypeScript, ESLint, Prettier

### Objective
Strict typechecking and consistent formatting across all three packages.

### Files touched
```
tsconfig.base.json
apps/backend/tsconfig.json
apps/frontend/tsconfig.json
packages/shared/tsconfig.json
.eslintrc.cjs
.prettierrc
```

### Implementation

**0.2.1** `tsconfig.base.json` — strictness turned all the way up. The three
flags beyond `strict` matter:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["bun-types"]
  }
}
```

- `noUncheckedIndexedAccess` forces you to handle `arr[0]` possibly being
  `undefined` — directly relevant when parsing LLM output arrays.
- `exactOptionalPropertyTypes` stops `{ foo?: string }` silently accepting
  `{ foo: undefined }`, which matters for Prisma update payloads.

**0.2.2** Path aliases so imports read cleanly:

```json
"paths": {
  "@/*": ["./src/*"],
  "@pricewise/shared": ["../../packages/shared/src/index.ts"]
}
```

**0.2.3** ESLint with the TypeScript parser, plus one custom-enforced rule
documented in the README: **no `prisma` import outside `src/repositories/`**.
Implement as an `no-restricted-imports` override:

```js
{
  files: ["apps/backend/src/**/*.ts"],
  excludedFiles: ["apps/backend/src/repositories/**", "apps/backend/src/lib/prisma.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [{ name: "@prisma/client", message: "Query only from src/repositories — see rule 0.R1." }],
      patterns: ["**/lib/prisma"]
    }]
  }
}
```

This is worth building because it turns an architectural convention into a
mechanically enforced rule — a strong signal in code review.

### Acceptance criteria
- `bun run typecheck` passes on empty packages.
- `bun run lint` passes.
- Importing `@prisma/client` from a fake file in `src/services/` produces a lint
  error.

### Commit
```
chore(tooling): add strict typescript config, eslint, prettier
```

### Interview note
*"Why enforce the Prisma import restriction with a linter instead of a code review convention?"* —
Conventions decay under time pressure, and this project was built in five days.
A lint rule makes the layering violation impossible to merge, which is the only
way "every query is tenant-scoped" stays true as the codebase grows.

---

## 0.3 — Environment configuration

### Objective
A boot-time-validated environment with a documented `.env.example`.

### Files touched
```
apps/backend/src/lib/env.ts
apps/backend/.env.example
apps/frontend/.env.example
```

### Implementation

**0.3.1** `env.ts` — the only file in the backend allowed to read `process.env`.

```ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "must be at least 32 chars"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  CORS_ORIGIN: z.string().url(),

  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL_FAST: z.string(),
  GROQ_MODEL_STRONG: z.string(),

  AGENT_TIMEOUT_MS: z.coerce.number().int().default(30_000),
  AGENT_MAX_RETRIES: z.coerce.number().int().default(2),

  MOCK_PLATFORM_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  MOCK_PLATFORM_LATENCY_MS: z.coerce.number().int().default(400),

  LOG_LEVEL: z.enum(["fatal","error","warn","info","debug","trace"]).default("info"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
```

**0.3.2** `.env.example` — every variable documented. The assessment requires
this file *with descriptions*, not just names.

```dotenv
# ---- Runtime -------------------------------------------------------------
NODE_ENV=development
PORT=4000
LOG_LEVEL=debug

# ---- Database ------------------------------------------------------------
# Local docker-compose Postgres. In production this is the Supabase pooled URL.
DATABASE_URL=postgresql://pricewise:pricewise@localhost:5432/pricewise
# Unpooled connection, used only by `prisma migrate`. Supabase provides this
# separately; leave unset locally.
DIRECT_URL=

# ---- Auth ----------------------------------------------------------------
# Generate with: openssl rand -base64 48
JWT_ACCESS_SECRET=replace-me-with-48-random-bytes-min-32-chars
JWT_REFRESH_SECRET=replace-me-with-a-different-48-random-bytes
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
# Leave blank locally; set to the API host in production.
COOKIE_DOMAIN=
# Must be true in production (HTTPS only).
COOKIE_SECURE=false
# Exact frontend origin. No wildcards — credentials mode forbids them.
CORS_ORIGIN=http://localhost:5173

# ---- AI ------------------------------------------------------------------
# https://console.groq.com/keys — free tier is sufficient for this project.
GROQ_API_KEY=gsk_replace_me
# Cheaper/faster model for the mechanical agents (market intel, inventory).
GROQ_MODEL_FAST=<fill-from-groq-console>
# Stronger model for synthesis and compliance agents.
GROQ_MODEL_STRONG=<fill-from-groq-console>
AGENT_TIMEOUT_MS=30000
AGENT_MAX_RETRIES=2

# ---- Mock e-commerce platform -------------------------------------------
# Probability that a simulated price push fails, to exercise rollback logic.
MOCK_PLATFORM_FAILURE_RATE=0.1
MOCK_PLATFORM_LATENCY_MS=400
```

### Acceptance criteria
- Deleting `JWT_ACCESS_SECRET` and starting the server prints
  `JWT_ACCESS_SECRET: Required` and exits with code 1.
- Setting `JWT_ACCESS_SECRET` to a 10-character string prints the min-length
  message and exits.
- No file other than `env.ts` contains `process.env`.

### Commit
```
feat(config): validate environment at boot with zod, document .env.example
```

### Interview note
*"Why crash on a bad env var instead of falling back to a default?"* — A missing
JWT secret with a default would silently sign tokens with a known value. Failing
loudly at boot converts a security incident into a deployment error, which is
always the cheaper failure.

---

## 0.4 — Local database via Docker Compose

### Objective
`bun run db:up` gives any evaluator a working Postgres with no Supabase account.

### Files touched
```
docker-compose.yml
```

### Implementation

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: pricewise-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: pricewise
      POSTGRES_PASSWORD: pricewise
      POSTGRES_DB: pricewise
    ports:
      - "5432:5432"
    volumes:
      - pricewise-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pricewise -d pricewise"]
      interval: 5s
      timeout: 5s
      retries: 10

  adminer:
    image: adminer:latest
    container_name: pricewise-adminer
    restart: unless-stopped
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pricewise-pgdata:
```

The healthcheck matters: the seed script in Phase 2 and the CI job in Phase 5
both need to wait for readiness rather than racing the container.

### Acceptance criteria
- `bun run db:up` then `docker compose ps` shows both services healthy.
- Adminer at `localhost:8080` connects with the credentials above.
- `bun run db:down && bun run db:up` preserves data (named volume).

### Commit
```
chore(dev): add docker compose for local postgres and adminer
```

### Interview note
*"You use Supabase in production but Docker locally — isn't that a mismatch?"* —
Supabase *is* Postgres; Prisma talks the same protocol to both. Keeping local
development on a disposable container means a clean clone needs no account
signup, no shared staging database, and no risk of a developer running a
destructive migration against a live environment. The one real difference,
connection pooling, is handled by using `DIRECT_URL` for migrations.

---

## 0.5 — CI skeleton

### Objective
GitHub Actions runs on every push and proves the repo installs and typechecks.
Tests are added to this pipeline in Phase 5; the skeleton exists from day one so
it is never a last-minute scramble.

### Files touched
```
.github/workflows/ci.yml
```

### Implementation

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Typecheck & lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Generate Prisma client
        run: bun run --cwd apps/backend db:generate
      - name: Typecheck
        run: bun run typecheck
      - name: Lint
        run: bun run lint
```

`bun install --frozen-lockfile` is deliberate: it fails if `bun.lockb` is out of
date with `package.json`, catching the "works on my machine" class of bug.

### Acceptance criteria
- Pushing to a branch triggers the workflow and it goes green.
- Introducing a type error makes it go red.

### Commit
```
chore(ci): add github actions typecheck and lint workflow
```

---

## 0.6 — Project structure scaffold

### Objective
Empty directories and index files in place so later phases never need to invent
structure under time pressure.

### Files touched

```
apps/backend/src/
├── agents/
│   ├── definitions/          # one file per agent
│   ├── tools/                # callable tool implementations
│   ├── orchestrator.ts
│   ├── groqClient.ts
│   └── confidence.ts
├── controllers/
├── lib/
│   ├── env.ts
│   ├── prisma.ts
│   ├── logger.ts
│   ├── jwt.ts
│   ├── password.ts
│   ├── errors.ts
│   └── envelope.ts
├── middleware/
│   ├── requestId.ts
│   ├── auth.ts
│   ├── tenant.ts
│   ├── rbac.ts
│   ├── rateLimit.ts
│   ├── validate.ts
│   └── errorHandler.ts
├── repositories/
├── routes/
├── services/
├── scripts/
│   ├── generateSyntheticData.ts
│   └── seed.ts
├── types/
│   └── express.d.ts          # augments Request with ctx
└── server.ts

apps/frontend/src/
├── components/
│   ├── ui/                   # shadcn primitives
│   ├── layout/
│   ├── products/
│   ├── recommendations/
│   ├── agents/
│   └── admin/
├── pages/
├── hooks/
├── lib/
│   ├── api.ts
│   ├── queryClient.ts
│   └── format.ts
├── contexts/
│   └── AuthContext.tsx
├── routes.tsx
└── main.tsx

packages/shared/src/
├── schemas/
│   ├── auth.ts
│   ├── product.ts
│   ├── recommendation.ts
│   ├── organization.ts
│   └── agent.ts
├── types/
├── constants.ts
└── index.ts
```

**0.6.1** Express `Request` augmentation — this is what makes `req.ctx.orgId`
type-safe throughout:

```ts
// apps/backend/src/types/express.d.ts
import type { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      ctx?: {
        userId: string;
        orgId: string;
        role: Role;
      };
      validated?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}
export {};
```

`ctx` is optional on the type because unauthenticated routes exist; the auth
middleware narrows it, and a helper `requireCtx(req)` throws if absent so
handlers never write `req.ctx!`.

### Acceptance criteria
- `bun run typecheck` passes with the scaffold in place.
- Every directory contains at least a placeholder so git tracks it.

### Commit
```
chore(structure): scaffold backend, frontend and shared package layout
```

---

# Phase 1 — Data model, authentication, tenancy

**Goal:** a running API where a user can sign up, log in, refresh, log out, and
where every protected route resolves a tenant and enforces a role.

**Duration estimate:** 7 hours

---

## 1.1 — Prisma schema

### Objective
The complete data model, migrated, with indexes that match the query patterns of
later phases.

### Files touched
```
apps/backend/prisma/schema.prisma
apps/backend/prisma/migrations/
apps/backend/src/lib/prisma.ts
```

### Implementation

**1.1.1** Install and initialize.

```bash
cd apps/backend
bun add @prisma/client
bun add -d prisma
bunx prisma init --datasource-provider postgresql
```

**1.1.2** The schema. Written in full because the rest of the build depends on
these exact names.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ---------------------------------------------------------------- enums

enum Role {
  ADMIN
  PRICING_ANALYST
}

enum InventoryStatus {
  LOW
  NORMAL
  OVERSTOCKED
}

enum RecStatus {
  PENDING
  APPROVED
  REJECTED
  MODIFIED
  AUTO_EXECUTED
  FAILED
}

enum AgentName {
  MARKET_INTELLIGENCE
  DEMAND_FORECASTING
  INVENTORY_COST
  PRICING_STRATEGY
  EXECUTION_COMPLIANCE
}

// ------------------------------------------------------------- tenancy

model Organization {
  id                  String   @id @default(uuid())
  name                String
  confidenceThreshold Float    @default(0.85)
  maxPriceDeltaPct    Float    @default(0.20)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  users           User[]
  products        Product[]
  invites         Invite[]
  recommendations PricingRecommendation[]
  auditLogs       AuditLog[]
  categoryRules   CategoryRule[]
}

model User {
  id             String   @id @default(uuid())
  email          String   @unique
  passwordHash   String
  name           String
  role           Role     @default(PRICING_ANALYST)
  organizationId String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization  Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  refreshTokens RefreshToken[]
  resolved      PricingRecommendation[] @relation("ResolvedBy")

  @@index([organizationId])
}

model RefreshToken {
  id           String    @id @default(uuid())
  tokenHash    String    @unique
  userId       String
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById String?
  createdAt    DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model Invite {
  id             String    @id @default(uuid())
  organizationId String
  email          String
  role           Role
  code           String    @unique
  expiresAt      DateTime
  usedAt         DateTime?
  createdAt      DateTime  @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
}

// -------------------------------------------------------------- catalog

model Product {
  id              String          @id @default(uuid())
  organizationId  String
  sku             String
  name            String
  category        String
  currentPrice    Decimal         @db.Decimal(10, 2)
  cost            Decimal         @db.Decimal(10, 2)
  marginFloorPct  Float           @default(0.15)
  inventoryLevel  Int
  inventoryStatus InventoryStatus @default(NORMAL)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  organization    Organization            @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  competitorPrices CompetitorPrice[]
  demandSignals    DemandSignal[]
  recommendations  PricingRecommendation[]

  @@unique([organizationId, sku])
  @@index([organizationId, category])
  @@index([organizationId, inventoryStatus])
}

model CategoryRule {
  id             String   @id @default(uuid())
  organizationId String
  category       String
  marginFloorPct Float
  maxDeltaPct    Float
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, category])
}

model CompetitorPrice {
  id         String   @id @default(uuid())
  productId  String
  competitor String
  price      Decimal  @db.Decimal(10, 2)
  scrapedAt  DateTime @default(now())

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, scrapedAt])
}

model DemandSignal {
  id          String   @id @default(uuid())
  productId   String
  signalType  String   // SEASONAL | CATEGORY_TREND | SKU_VELOCITY
  value       Float
  periodStart DateTime
  periodEnd   DateTime

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, periodEnd])
}

// ------------------------------------------------------ recommendations

model PricingRecommendation {
  id                 String    @id @default(uuid())
  organizationId     String
  productId          String
  recommendedPrice   Decimal   @db.Decimal(10, 2)
  currentPriceAtTime Decimal   @db.Decimal(10, 2)
  confidenceScore    Float
  rationale          String    @db.Text
  factorWeights      Json?
  status             RecStatus @default(PENDING)
  resolvedByUserId   String?
  resolvedAt         DateTime?
  rejectionReason    String?
  modifiedPrice      Decimal?  @db.Decimal(10, 2)
  failureReason      String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  product      Product         @relation(fields: [productId], references: [id], onDelete: Cascade)
  resolvedBy   User?           @relation("ResolvedBy", fields: [resolvedByUserId], references: [id])
  agentRuns    AgentRun[]
  executions   PriceExecution[]

  @@index([organizationId, status, createdAt])
  @@index([productId, createdAt])
}

model AgentRun {
  id               String    @id @default(uuid())
  recommendationId String
  agentName        AgentName
  input            Json
  output           Json?
  confidence       Float?
  model            String
  promptTokens     Int       @default(0)
  completionTokens Int       @default(0)
  durationMs       Int
  error            String?
  createdAt        DateTime  @default(now())

  recommendation PricingRecommendation @relation(fields: [recommendationId], references: [id], onDelete: Cascade)

  @@index([recommendationId])
}

model PriceExecution {
  id               String   @id @default(uuid())
  recommendationId String
  attemptedPrice   Decimal  @db.Decimal(10, 2)
  succeeded        Boolean
  platformResponse Json?
  rolledBack       Boolean  @default(false)
  createdAt        DateTime @default(now())

  recommendation PricingRecommendation @relation(fields: [recommendationId], references: [id], onDelete: Cascade)

  @@index([recommendationId])
}

model AuditLog {
  id             String   @id @default(uuid())
  organizationId String
  userId         String?
  action         String
  entityType     String
  entityId       String
  beforeValue    Json?
  afterValue     Json?
  ipAddress      String?
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, createdAt])
  @@index([entityType, entityId])
}
```

**1.1.3** Note the `Decimal` usage. Money is never `Float`. `Decimal(10,2)` in
Postgres, surfaced by Prisma as `Decimal`, converted to a number only at the API
boundary. A float rounding error in a pricing product is the kind of detail an
interviewer will specifically probe.

**1.1.4** Prisma singleton — Bun's hot reload otherwise opens a new pool per
reload and exhausts connections:

```ts
// apps/backend/src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**1.1.5** Add scripts to `apps/backend/package.json`:

```json
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"db:deploy": "prisma migrate deploy",
"db:reset": "prisma migrate reset --force && bun run db:seed",
"db:seed": "bun run src/scripts/seed.ts",
"db:studio": "prisma studio"
```

### Acceptance criteria
- `bun run db:migrate --name init` creates the migration and applies it.
- Adminer shows all 11 tables.
- `bunx prisma validate` passes.
- Re-running `db:migrate` reports no drift.

### Commit
```
feat(db): add complete prisma schema with tenant-scoped models and indexes
```

### Interview note
*"Why is organizationId on PricingRecommendation when it's reachable through Product?"* —
The approval queue is the hottest read path in the product: "give me every
pending recommendation for my org, newest first." Without the denormalised
column that is a join plus a filter; with it, the composite index
`[organizationId, status, createdAt]` answers the query directly. The cost is
that both writes must stay consistent, which is contained because
recommendations are only ever created in one service function.

---

## 1.2 — Shared Zod schemas

### Objective
One definition of every request and response shape, consumed by the API, the web
client, and the OpenAPI generator.

### Files touched
```
packages/shared/src/schemas/*.ts
packages/shared/src/constants.ts
packages/shared/src/index.ts
```

### Implementation

**1.2.1** Auth schemas — note the password policy lives here, so the frontend
form and the API enforce byte-identical rules.

```ts
// packages/shared/src/schemas/auth.ts
import { z } from "zod";

export const PasswordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[a-z]/.test(v), "Must contain a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Must contain an uppercase letter")
  .refine((v) => /[0-9]/.test(v), "Must contain a digit");

export const SignupSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: PasswordSchema,
  name: z.string().min(1).max(120).trim(),
  organizationName: z.string().min(2).max(120).trim(),
});

export const InviteSignupSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: PasswordSchema,
  name: z.string().min(1).max(120).trim(),
  inviteCode: z.string().length(12),
});

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
```

The `.toLowerCase().trim()` transforms matter: they run on both client and
server, so `" Alice@Example.COM "` and `alice@example.com` cannot become two
accounts.

**1.2.2** Product schemas, with a cross-field refinement that is genuinely
business logic:

```ts
export const ProductInputSchema = z.object({
  sku: z.string().min(1).max(64).regex(/^[A-Z0-9-]+$/i, "SKU may contain letters, digits and hyphens"),
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(64),
  currentPrice: z.number().positive().max(1_000_000),
  cost: z.number().positive().max(1_000_000),
  marginFloorPct: z.number().min(0).max(0.95),
  inventoryLevel: z.number().int().min(0),
}).refine((v) => v.currentPrice > v.cost, {
  message: "Current price must exceed cost",
  path: ["currentPrice"],
});
```

**1.2.3** Agent output schemas — these are the contracts the LLM must satisfy.
Defined here, in shared, because the frontend renders them in the explainability
view and needs the same types.

```ts
// packages/shared/src/schemas/agent.ts
import { z } from "zod";

const Confidence = z.number().min(0).max(1);

export const MarketIntelOutputSchema = z.object({
  competitorMin: z.number().nonnegative(),
  competitorMedian: z.number().nonnegative(),
  competitorMax: z.number().nonnegative(),
  trend: z.enum(["rising", "falling", "stable"]),
  newEntrants: z.array(z.string()).max(10),
  dataAgeDays: z.number().nonnegative(),
  notes: z.string().max(600),
  confidence: Confidence,
});

export const DemandOutputSchema = z.object({
  elasticity: z.number(),                     // negative = normal good
  seasonalIndex: z.number().positive(),       // 1.0 = baseline
  velocityTrend: z.enum(["accelerating", "steady", "decelerating"]),
  projectedUnitDeltaPct: z.number(),
  notes: z.string().max(600),
  confidence: Confidence,
});

export const InventoryOutputSchema = z.object({
  stockStatus: z.enum(["LOW", "NORMAL", "OVERSTOCKED"]),
  daysOfCover: z.number().nonnegative(),
  unitCost: z.number().nonnegative(),
  absoluteFloorPrice: z.number().nonnegative(),
  constraints: z.array(z.string()).max(10),
  notes: z.string().max(600),
  confidence: Confidence,
});

export const StrategyOutputSchema = z.object({
  recommendedPrice: z.number().positive(),
  direction: z.enum(["increase", "decrease", "hold"]),
  rationale: z.string().min(40).max(1500),
  factorWeights: z.object({
    competitorPressure: z.number().min(0).max(1),
    demandSignal: z.number().min(0).max(1),
    inventoryPosition: z.number().min(0).max(1),
    marginProtection: z.number().min(0).max(1),
  }),
  confidence: Confidence,
});

export const ComplianceOutputSchema = z.object({
  decision: z.enum(["allow", "block", "adjust"]),
  finalPrice: z.number().positive(),
  violations: z.array(z.object({
    rule: z.string(),
    detail: z.string(),
  })).max(10),
  notes: z.string().max(600),
});
```

**1.2.4** Barrel export in `index.ts`, and a `constants.ts` holding shared
literals (role names, status values, agent display names, pagination defaults)
so no magic string appears twice.

### Acceptance criteria
- `import { SignupSchema } from "@pricewise/shared"` resolves in both apps.
- `SignupSchema.parse({...})` rejects a 9-character password.
- `ProductInputSchema` rejects `{ currentPrice: 5, cost: 10 }` with the message
  attached to the `currentPrice` path.

### Commit
```
feat(shared): add zod schemas for auth, product, agent and recommendation contracts
```

### Interview note
*"Why put the LLM output schemas in shared rather than the backend?"* — The
recommendation detail page renders each agent's output in a typed component. If
the schema lived only in the backend, the frontend would re-declare those shapes
and they would drift the first time a prompt changed. Sharing them means a prompt
change that alters the output shape breaks the frontend build immediately.

---

## 1.3 — Password hashing and JWT utilities

### Objective
Cryptographic primitives isolated in small, unit-testable modules.

### Files touched
```
apps/backend/src/lib/password.ts
apps/backend/src/lib/jwt.ts
apps/backend/src/lib/errors.ts
apps/backend/src/lib/envelope.ts
```

### Implementation

**1.3.1** Password hashing with argon2id.

```bash
bun add argon2
```

```ts
// apps/backend/src/lib/password.ts
import argon2 from "argon2";

const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,   // 19 MiB — OWASP minimum recommendation
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed hash must read as "wrong password", never as a 500.
    return false;
  }
}
```

**1.3.2** JWT helpers. Two separate secrets, so a leaked access secret cannot
mint refresh tokens.

```bash
bun add jose
```

```ts
// apps/backend/src/lib/jwt.ts
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import type { Role } from "@prisma/client";

const accessSecret  = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export interface AccessClaims {
  sub: string;     // userId
  orgId: string;
  role: Role;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ orgId: claims.orgId, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer("pricewise-api")
    .setAudience("pricewise-web")
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: "pricewise-api",
    audience: "pricewise-web",
  });
  return {
    sub: payload.sub as string,
    orgId: payload.orgId as string,
    role: payload.role as Role,
  };
}

export async function signRefreshToken(userId: string, tokenId: string): Promise<string> {
  return new SignJWT({ jti: tokenId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer("pricewise-api")
    .setExpirationTime(`${env.REFRESH_TOKEN_TTL_DAYS}d`)
    .sign(refreshSecret);
}
```

**1.3.3** Typed errors.

```ts
// apps/backend/src/lib/errors.ts
export type ErrorCode =
  | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "REFRESH_INVALID"
  | "FORBIDDEN_ROLE"   | "NOT_FOUND"       | "EMAIL_IN_USE"
  | "INVITE_INVALID"   | "RATE_LIMITED"    | "AGENT_TIMEOUT"
  | "LLM_UNAVAILABLE"  | "EXECUTION_FAILED"| "CONFLICT"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422, UNAUTHENTICATED: 401, REFRESH_INVALID: 401,
  FORBIDDEN_ROLE: 403,   NOT_FOUND: 404,      EMAIL_IN_USE: 409,
  INVITE_INVALID: 400,   RATE_LIMITED: 429,   AGENT_TIMEOUT: 504,
  LLM_UNAVAILABLE: 503,  EXECUTION_FAILED: 502, CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status(): number { return STATUS[this.code]; }
}

export const notFound      = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`);
export const unauthenticated = (m = "Authentication required") => new AppError("UNAUTHENTICATED", m);
export const forbidden     = (m = "Insufficient permissions") => new AppError("FORBIDDEN_ROLE", m);
```

**1.3.4** Envelope helpers so `{ success: true, data }` is never hand-written.

### Acceptance criteria
- Unit test: hashing the same password twice yields different hashes (salt) and
  both verify.
- Unit test: `verifyPassword("not-a-hash", "x")` returns `false`, does not throw.
- Unit test: a token signed with the refresh secret fails `verifyAccessToken`.
- Unit test: an expired token throws.

### Commit
```
feat(auth): add argon2 password hashing, jose jwt helpers and typed app errors
```

### Interview note
*"Why argon2id over bcrypt?"* — bcrypt is fine and still widely used, but it
caps the password at 72 bytes and is only CPU-hard. argon2id is memory-hard,
which raises the cost of GPU/ASIC cracking substantially, and is the current
OWASP first recommendation. The parameters above are OWASP's minimum profile.
*"Why two JWT secrets?"* — Blast radius. If the access secret leaks, an attacker
can forge 15-minute tokens; they still cannot mint refresh tokens or extend a
session past the access TTL.

---

## 1.4 — Auth service and refresh-token rotation

### Objective
Signup, login, refresh with rotation and theft detection, and logout.

### Files touched
```
apps/backend/src/services/auth.service.ts
apps/backend/src/repositories/user.repository.ts
apps/backend/src/repositories/refreshToken.repository.ts
apps/backend/src/lib/cookies.ts
```

### Implementation

**1.4.1** Cookie helper — one place that decides cookie flags.

```ts
// apps/backend/src/lib/cookies.ts
import type { Response } from "express";
import { env } from "./env";

const base = {
  httpOnly: true as const,
  secure: env.COOKIE_SECURE,
  sameSite: "lax" as const,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};

export function setAuthCookies(res: Response, access: string, refresh: string) {
  res.cookie("access_token", access, { ...base, path: "/", maxAge: 15 * 60 * 1000 });
  // The refresh cookie is scoped to the one route that consumes it, so it is
  // not transmitted on every ordinary API call.
  res.cookie("refresh_token", refresh, {
    ...base,
    path: "/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("access_token", { ...base, path: "/" });
  res.clearCookie("refresh_token", { ...base, path: "/auth" });
}
```

**1.4.2** Signup — creates an Organization and its first ADMIN atomically.

```ts
export async function signup(input: SignupInput, ip?: string) {
  const existing = await userRepo.findByEmail(input.email);
  if (existing) throw new AppError("EMAIL_IN_USE", "An account with that email already exists");

  const passwordHash = await hashPassword(input.password);

  // One transaction: an org without an admin, or an admin without an org,
  // are both invalid states that must never be observable.
  const { user, organization } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: input.organizationName },
    });
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        role: "ADMIN",              // first user of a new org is always admin
        organizationId: organization.id,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        action: "ORG_CREATED",
        entityType: "Organization",
        entityId: organization.id,
        afterValue: { name: organization.name },
        ipAddress: ip ?? null,
      },
    });
    return { user, organization };
  });

  const tokens = await issueTokenPair(user);
  return { user, organization, tokens };
}
```

**1.4.3** Token issuance and rotation — the security-critical part.

```ts
async function issueTokenPair(user: { id: string; orgId: string; role: Role }) {
  const tokenId = crypto.randomUUID();
  const refresh = await signRefreshToken(user.id, tokenId);

  await refreshRepo.create({
    id: tokenId,
    tokenHash: sha256(refresh),   // store a hash, never the token itself
    userId: user.id,
    expiresAt: addDays(new Date(), env.REFRESH_TOKEN_TTL_DAYS),
  });

  const access = await signAccessToken({ sub: user.id, orgId: user.orgId, role: user.role });
  return { access, refresh };
}

export async function refresh(presentedToken: string) {
  const claims = await verifyRefreshToken(presentedToken);   // throws if signature/exp bad
  const stored = await refreshRepo.findByHash(sha256(presentedToken));

  if (!stored) throw new AppError("REFRESH_INVALID", "Session expired, please sign in again");

  // Theft detection: the token is valid and known, but already rotated away.
  // Either the legitimate client replayed, or an attacker stole an old token.
  // Either way, burn the whole chain.
  if (stored.revokedAt) {
    await refreshRepo.revokeAllForUser(stored.userId);
    logger.warn({ userId: stored.userId }, "refresh token reuse detected — chain revoked");
    throw new AppError("REFRESH_INVALID", "Session invalidated, please sign in again");
  }

  if (stored.expiresAt < new Date()) {
    throw new AppError("REFRESH_INVALID", "Session expired, please sign in again");
  }

  const user = await userRepo.findByIdWithOrg(stored.userId);
  if (!user) throw new AppError("REFRESH_INVALID", "Session invalid");

  const next = await issueTokenPair({ id: user.id, orgId: user.organizationId, role: user.role });
  await refreshRepo.markRotated(stored.id, next.tokenId);

  return { user, tokens: next };
}
```

**1.4.4** Login — constant-time-ish behaviour. Always run a hash verification
even when the user does not exist, so response timing does not reveal whether an
email is registered.

```ts
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXk$..."; // precomputed

export async function login(input: LoginInput) {
  const user = await userRepo.findByEmailWithOrg(input.email);
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const ok = await verifyPassword(hash, input.password);

  if (!user || !ok) throw new AppError("UNAUTHENTICATED", "Invalid email or password");

  const tokens = await issueTokenPair({ id: user.id, orgId: user.organizationId, role: user.role });
  return { user, tokens };
}
```

### Acceptance criteria
- Signup creates exactly one Organization, one ADMIN User, one AuditLog row.
- A duplicate email returns 409 `EMAIL_IN_USE`.
- Refresh returns a **different** refresh token each time.
- Presenting a previously-rotated refresh token returns 401 **and** revokes every
  token for that user (verified by a follow-up refresh with the current token
  also failing).
- Login with a nonexistent email and login with a wrong password return the same
  error body and comparable timing.

### Commit
```
feat(auth): implement signup, login, rotating refresh with reuse detection, logout
```

### Interview note
*"Walk me through refresh token rotation."* — Each refresh issues a brand-new
refresh token and marks the old one rotated. Because a token can legitimately be
used exactly once, a second use of an already-rotated token is evidence that two
parties hold it — a theft signal. The response is to revoke the entire chain for
that user, forcing a re-login. The cost is that a client with a flaky network can
occasionally be logged out; the benefit is that a stolen refresh token has a
bounded useful life instead of an unbounded one.

---

## 1.5 — Middleware chain

### Objective
Every cross-cutting concern implemented once, ordered deliberately.

### Files touched
```
apps/backend/src/middleware/*.ts
apps/backend/src/server.ts
```

### Implementation

**1.5.1** Order is load-bearing. In `server.ts`:

```ts
app.use(requestId);          // 1. correlation id first, so everything can log it
app.use(pinoHttp({ logger })); // 2. logging second, so it captures all later errors
app.use(helmet());           // 3. security headers before any handler can respond
app.use(cors(corsOptions));  // 4. CORS before routes, must precede auth for preflight
app.use(cookieParser());     // 5. parse cookies before auth reads them
app.use(express.json({ limit: "1mb" }));  // 6. bounded body
app.use(csrfGuard);          // 7. custom-header check on state-changing verbs
app.use(generalRateLimit);   // 8. broad limit

app.use("/auth", authRateLimit, authRoutes);   // stricter limiter on auth only
app.use("/products", requireAuth, tenantScope, productRoutes);
app.use("/recommendations", requireAuth, tenantScope, recommendationRoutes);
app.use("/org", requireAuth, tenantScope, orgRoutes);
app.use("/audit-logs", requireAuth, tenantScope, auditRoutes);

app.use(notFoundHandler);    // unmatched route → 404 envelope
app.use(errorHandler);       // last, catches everything above
```

**1.5.2** Auth middleware.

```ts
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.access_token;
  if (!token) return next(unauthenticated());

  try {
    const claims = await verifyAccessToken(token);
    req.ctx = { userId: claims.sub, orgId: claims.orgId, role: claims.role };
    next();
  } catch {
    next(unauthenticated("Session expired"));
  }
}
```

**1.5.3** Tenant middleware — deliberately paranoid.

```ts
export function tenantScope(req: Request, _res: Response, next: NextFunction) {
  if (!req.ctx) return next(unauthenticated());

  // A client must never be able to influence which tenant it reads.
  const smuggled =
    (req.body && typeof req.body === "object" && "organizationId" in req.body) ||
    "organizationId" in req.query;

  if (smuggled) {
    logger.warn(
      { requestId: req.requestId, userId: req.ctx.userId, path: req.path },
      "client supplied organizationId — ignored",
    );
    if (req.body && typeof req.body === "object") delete (req.body as Record<string, unknown>).organizationId;
    delete (req.query as Record<string, unknown>).organizationId;
  }

  next();
}
```

**1.5.4** RBAC middleware as a factory.

```ts
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.ctx) return next(unauthenticated());
    if (!allowed.includes(req.ctx.role)) {
      return next(forbidden(`Requires one of: ${allowed.join(", ")}`));
    }
    next();
  };
}

// usage: router.post("/", requireRole("ADMIN"), validate({ body: ProductInputSchema }), createProduct);
```

**1.5.5** Rate limiting — two tiers.

```ts
export const generalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.ctx?.userId ?? req.ip ?? "anon",
  handler: (_req, res) => res.status(429).json(errorEnvelope("RATE_LIMITED", "Too many requests")),
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,   // only failed logins count toward the limit
  keyGenerator: (req) => `${req.ip}:${(req.body as { email?: string })?.email ?? ""}`,
  handler: (_req, res) => res.status(429).json(errorEnvelope("RATE_LIMITED", "Too many attempts, try again later")),
});
```

`skipSuccessfulRequests` is the important detail: a user legitimately logging in
ten times should not be locked out, but ten *failed* attempts is a brute-force
signal.

**1.5.6** Validation middleware.

```ts
export function validate(schemas: { body?: ZodSchema; query?: ZodSchema; params?: ZodSchema }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.validated = {};
      if (schemas.body)   req.validated.body   = schemas.body.parse(req.body);
      if (schemas.query)  req.validated.query  = schemas.query.parse(req.query);
      if (schemas.params) req.validated.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new AppError("VALIDATION_ERROR", "Request validation failed", flattenZodError(err)));
      }
      next(err);
    }
  };
}
```

**1.5.7** Error handler — the single exit point.

```ts
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ requestId: req.requestId, err }, err.message);
    else logger.info({ requestId: req.requestId, code: err.code }, err.message);
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  logger.error({ requestId: req.requestId, err }, "unhandled error");
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: `Unexpected error. Reference: ${req.requestId}`,
    },
  });
}
```

Note what is absent: no stack trace reaches the client, but the correlation id
does, so a user-reported failure can be found in the logs immediately.

### Acceptance criteria
- Request without cookie to a protected route → 401 `UNAUTHENTICATED`.
- Request with a token signed by the refresh secret → 401.
- ANALYST calling an ADMIN route → 403 `FORBIDDEN_ROLE`.
- 11 failed logins in 15 minutes → 429 with `Retry-After`.
- POST with `organizationId` in the body → logged warning, field stripped.
- Thrown `AppError` produces the envelope; thrown `Error` produces
  `INTERNAL_ERROR` with the request id and no stack.

### Commit
```
feat(api): add middleware chain — auth, tenant scope, rbac, rate limit, validation, error handling
```

### Interview note
*"Why is CORS before auth?"* — A browser preflight `OPTIONS` request carries no
cookies. If auth ran first it would reject the preflight, and the real request
would never be sent. CORS must answer preflights before authentication is
considered.

---

## 1.6 — Auth routes and controllers

### Objective
The auth surface wired end to end and verified with integration tests.

### Files touched
```
apps/backend/src/routes/auth.routes.ts
apps/backend/src/controllers/auth.controller.ts
apps/backend/tests/integration/auth.test.ts
```

### Implementation

```ts
const router = Router();

router.post("/signup",        validate({ body: SignupSchema }),       ctrl.signup);
router.post("/signup/invite", validate({ body: InviteSignupSchema }), ctrl.signupWithInvite);
router.post("/login",         validate({ body: LoginSchema }),        ctrl.login);
router.post("/refresh",                                               ctrl.refresh);
router.post("/logout",                                                ctrl.logout);
router.get ("/me",            requireAuth,                            ctrl.me);
```

Controller shape — thin by rule 0.R1:

```ts
export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.validated!.body as SignupInput;
    const { user, organization, tokens } = await authService.signup(input, req.ip);
    setAuthCookies(res, tokens.access, tokens.refresh);
    res.status(201).json(ok({ user: toUserDTO(user), organization: toOrgDTO(organization) }));
  } catch (err) { next(err); }
}
```

`toUserDTO` exists so `passwordHash` can never accidentally be serialized — the
DTO mapper is an allow-list, not a delete-list.

### Acceptance criteria (integration tests)
1. Signup returns 201, sets two cookies, response body contains no `passwordHash`.
2. Signup with the same email returns 409.
3. Signup with a weak password returns 422 with a field-level detail.
4. Login returns 200 and cookies.
5. `/auth/me` without cookies returns 401; with cookies returns the user.
6. Refresh returns new cookies; the old refresh token then fails.
7. Logout clears cookies and revokes the stored token.

### Commit
```
feat(auth): wire auth routes with integration test coverage
```

---

## 1.7 — Postgres row-level security backstop

### Objective
A second, database-level guarantee of tenant isolation that does not depend on
application code being correct.

### Files touched
```
apps/backend/prisma/migrations/xxxx_rls/migration.sql
```

### Implementation

This is optional-but-impressive. Prisma connects as a single role, so RLS is
applied using a session variable set per transaction.

```sql
ALTER TABLE "Product"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PricingRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"              ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_product ON "Product"
  USING ("organizationId" = current_setting('app.current_org', true));

CREATE POLICY tenant_isolation_recommendation ON "PricingRecommendation"
  USING ("organizationId" = current_setting('app.current_org', true));

CREATE POLICY tenant_isolation_audit ON "AuditLog"
  USING ("organizationId" = current_setting('app.current_org', true));
```

Applied in the repository layer with an interactive transaction:

```ts
export async function withTenant<T>(orgId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_org', $1, true)`, orgId);
    return fn(tx);
  });
}
```

**Honest trade-off to document in DECISIONS.md:** this adds a transaction to
every read. Given the five-day timeline, apply it to the three highest-risk
tables rather than all of them, and say so — a partial, understood
implementation reads better than an unexplained one.

### Acceptance criteria
- A raw query for another org's product inside `withTenant` returns zero rows.
- Integration tests still pass.

### Commit
```
feat(db): add row-level security policies as a tenant isolation backstop
```

### Interview note
*"If the service layer already scopes every query, why add RLS?"* — Defence in
depth. The service-layer guarantee depends on a human never writing a query in
the wrong place; the lint rule makes that hard but not impossible. RLS means that
even a query written outside the intended layer cannot cross tenants. I applied
it to the three tables whose leakage would matter most rather than all eleven,
because of the per-read transaction cost, and that trade-off is documented.

---
# Phase 2 — Organizations, catalog, synthetic data, frontend shell

**Goal:** a working product catalog behind a real login screen, populated with
believable data for two separate organizations.

**Duration estimate:** 9 hours

---

## 2.1 — Organization settings and invites

### Objective
An admin can configure the confidence threshold and invite a colleague; an
invited user can join an existing organization.

### Files touched
```
apps/backend/src/services/organization.service.ts
apps/backend/src/repositories/organization.repository.ts
apps/backend/src/repositories/invite.repository.ts
apps/backend/src/controllers/organization.controller.ts
apps/backend/src/routes/organization.routes.ts
```

### Implementation

**2.1.1** Invite code generation. Human-transcribable, so the demo does not
require copy-paste.

```ts
// Crockford-style alphabet: no I, L, O, U — removes 1/l and 0/O confusion.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
```

`crypto.getRandomValues`, not `Math.random` — an invite code grants access to a
tenant, so it must not be predictable.

**2.1.2** Invite creation service.

```ts
export async function createInvite(
  orgId: string,
  actorId: string,
  input: { email: string; role: Role },
) {
  const existingUser = await userRepo.findByEmail(input.email);
  if (existingUser?.organizationId === orgId) {
    throw new AppError("CONFLICT", "That user is already a member of this organization");
  }

  // Supersede any outstanding invite for the same address rather than
  // accumulating several valid codes for one person.
  await inviteRepo.expireOutstanding(orgId, input.email);

  const invite = await inviteRepo.create({
    organizationId: orgId,
    email: input.email,
    role: input.role,
    code: generateInviteCode(),
    expiresAt: addDays(new Date(), 7),
  });

  await auditService.record({
    orgId, userId: actorId,
    action: "INVITE_CREATED", entityType: "Invite", entityId: invite.id,
    afterValue: { email: input.email, role: input.role },
  });

  return invite;
}
```

**2.1.3** Invite redemption, inside a transaction, with three checks that are
each a separate test case:

```ts
export async function redeemInvite(input: InviteSignupInput) {
  const invite = await inviteRepo.findByCode(input.inviteCode);

  if (!invite)                       throw new AppError("INVITE_INVALID", "Invite code not recognised");
  if (invite.usedAt)                 throw new AppError("INVITE_INVALID", "Invite code already used");
  if (invite.expiresAt < new Date()) throw new AppError("INVITE_INVALID", "Invite code has expired");

  // The invite is bound to an email address; anyone with the code cannot
  // redeem it under a different identity.
  if (invite.email.toLowerCase() !== input.email.toLowerCase()) {
    throw new AppError("INVITE_INVALID", "This invite was issued to a different email address");
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email, passwordHash, name: input.name,
        role: invite.role, organizationId: invite.organizationId,
      },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        organizationId: invite.organizationId, userId: user.id,
        action: "USER_JOINED", entityType: "User", entityId: user.id,
        afterValue: { email: user.email, role: user.role },
      },
    });
    return user;
  });
}
```

**2.1.4** Settings update with audit trail. The `beforeValue`/`afterValue` pair
is what makes the audit trail genuinely useful rather than decorative.

```ts
export async function updateSettings(orgId: string, actorId: string, patch: OrgSettingsPatch) {
  const before = await orgRepo.findById(orgId);
  if (!before) throw notFound("Organization");

  const after = await orgRepo.update(orgId, patch);

  await auditService.record({
    orgId, userId: actorId,
    action: "ORG_SETTINGS_UPDATED", entityType: "Organization", entityId: orgId,
    beforeValue: { confidenceThreshold: before.confidenceThreshold, maxPriceDeltaPct: before.maxPriceDeltaPct },
    afterValue:  { confidenceThreshold: after.confidenceThreshold,  maxPriceDeltaPct: after.maxPriceDeltaPct },
  });

  return after;
}
```

### Acceptance criteria
- ANALYST calling `POST /org/invites` → 403.
- ADMIN creating an invite twice for one email leaves exactly one active code.
- Redeeming with the wrong email → 400 `INVITE_INVALID`.
- Redeeming twice → second attempt 400.
- Settings patch writes an AuditLog row containing both before and after values.

### Commit
```
feat(org): add invite issuance, redemption and audited settings updates
```

### Interview note
*"Why bind the invite to an email instead of making it a bearer code?"* — A bare
code in a chat message is a tenant-access credential. Binding it to an address
means an intercepted code is useless without also controlling that inbox, which
turns one secret into two factors at no implementation cost.

---

## 2.2 — Product catalog CRUD

### Objective
Full tenant-scoped CRUD with filtering, search, sorting and pagination.

### Files touched
```
apps/backend/src/services/product.service.ts
apps/backend/src/repositories/product.repository.ts
apps/backend/src/controllers/product.controller.ts
apps/backend/src/routes/product.routes.ts
```

### Implementation

**2.2.1** The repository — note `orgId` is the first parameter on every function,
per rule 0.R2.

```ts
export async function findMany(orgId: string, filters: ProductFilters) {
  const where: Prisma.ProductWhereInput = {
    organizationId: orgId,                       // never optional, never overridable
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.inventoryStatus ? { inventoryStatus: filters.inventoryStatus } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { sku:  { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { [filters.sortBy]: filters.sortDir },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        competitorPrices: { orderBy: { scrapedAt: "desc" }, take: 1 },
        recommendations: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, recommendedPrice: true, confidenceScore: true },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return { items, totalCount };
}
```

The two `include` clauses are deliberate: the catalog table shows "last
competitor price" and "recommendation status" per row. Fetching them here avoids
an N+1 of one query per visible product.

**2.2.2** Margin computation belongs in the service, not the database and not the
frontend, so there is exactly one definition:

```ts
export function computeMargin(price: Decimal, cost: Decimal): number {
  const p = price.toNumber(), c = cost.toNumber();
  if (p <= 0) return 0;
  return (p - c) / p;                    // gross margin as a fraction of price
}

export function deriveInventoryStatus(level: number, thresholds = { low: 20, over: 400 }): InventoryStatus {
  if (level <= thresholds.low)  return "LOW";
  if (level >= thresholds.over) return "OVERSTOCKED";
  return "NORMAL";
}
```

**2.2.3** Update, with audit and status derivation:

```ts
export async function updateProduct(orgId: string, actorId: string, productId: string, patch: ProductPatch) {
  const before = await productRepo.findById(orgId, productId);
  if (!before) throw notFound("Product");        // 404 not 403 — see rule in HLD §5

  const nextLevel = patch.inventoryLevel ?? before.inventoryLevel;
  const after = await productRepo.update(orgId, productId, {
    ...patch,
    inventoryStatus: deriveInventoryStatus(nextLevel),
  });

  await auditService.record({
    orgId, userId: actorId,
    action: "PRODUCT_UPDATED", entityType: "Product", entityId: productId,
    beforeValue: pick(before, ["currentPrice", "cost", "inventoryLevel", "marginFloorPct"]),
    afterValue:  pick(after,  ["currentPrice", "cost", "inventoryLevel", "marginFloorPct"]),
  });

  return after;
}
```

**2.2.4** Routes with role gates:

```ts
router.get("/",            validate({ query: ProductQuerySchema }), ctrl.list);
router.get("/:productId",  validate({ params: IdParamSchema }),     ctrl.get);
router.post("/",           requireRole("ADMIN"), validate({ body: ProductInputSchema }), ctrl.create);
router.patch("/:productId",requireRole("ADMIN"), validate({ params: IdParamSchema, body: ProductPatchSchema }), ctrl.update);
router.delete("/:productId",requireRole("ADMIN"),validate({ params: IdParamSchema }),    ctrl.remove);
router.post("/:productId/simulate-market-event", validate({ params: IdParamSchema, body: MarketEventSchema }), ctrl.simulate);
```

### Acceptance criteria
- Org A cannot GET, PATCH or DELETE an Org B product — all return 404.
- Creating a duplicate SKU within one org → 409; the same SKU in the other org
  succeeds (proves the composite unique constraint is per-tenant).
- ANALYST POST → 403; ANALYST GET → 200.
- Pagination metadata is arithmetically correct at page boundaries.
- Search matches on both name and SKU, case-insensitively.

### Commit
```
feat(products): tenant-scoped catalog crud with filtering, search and pagination
```

---

## 2.3 — Synthetic data generator

### Objective
Data that looks like a real catalog under stress, not uniform noise — the agents
need patterns to reason about, and the demo needs situations worth showing.

### Files touched
```
apps/backend/src/scripts/generateSyntheticData.ts
apps/backend/src/scripts/catalogSeed.ts
```

### Implementation

**2.3.1** The catalog definition. Two organizations with genuinely different
shapes, so the demo's tenant-isolation moment is visually obvious.

```ts
export const ORGS = [
  {
    name: "Northwind Retail",
    confidenceThreshold: 0.85,
    users: [
      { email: "admin@northwind.test",   name: "Ada Admin",     role: "ADMIN" },
      { email: "analyst@northwind.test", name: "Alan Analyst",  role: "PRICING_ANALYST" },
    ],
    categories: ["Electronics", "Home & Kitchen", "Apparel"],
    skuCount: 28,
  },
  {
    name: "Meridian Goods",
    confidenceThreshold: 0.75,        // deliberately lower — more auto-executions
    users: [
      { email: "admin@meridian.test",   name: "Maya Admin",    role: "ADMIN" },
      { email: "analyst@meridian.test", name: "Marco Analyst", role: "PRICING_ANALYST" },
    ],
    categories: ["Electronics", "Outdoor", "Beauty"],
    skuCount: 26,
  },
];
```

Password for every seeded account: `Pricewise2026!` — documented in the README so an
evaluator can log in immediately.

**2.3.2** Realistic price generation. Category-aware, not uniform random:

```ts
const CATEGORY_PROFILES = {
  "Electronics":    { priceRange: [49, 1899],  marginRange: [0.12, 0.28], volatility: 0.08 },
  "Home & Kitchen": { priceRange: [15, 399],   marginRange: [0.25, 0.48], volatility: 0.04 },
  "Apparel":        { priceRange: [12, 189],   marginRange: [0.35, 0.62], volatility: 0.06 },
  "Outdoor":        { priceRange: [25, 899],   marginRange: [0.22, 0.45], volatility: 0.05 },
  "Beauty":         { priceRange: [8, 129],    marginRange: [0.40, 0.70], volatility: 0.03 },
} as const;
```

Electronics get thin margins and high volatility; beauty gets fat margins and
stability. This matters because the Inventory & Cost agent's floor constraint
should actually bind in some categories and not others — otherwise every
recommendation looks the same.

**2.3.3** Competitor price history — a 30-day series per product per competitor,
generated as a random walk with occasional shocks:

```ts
function generateCompetitorSeries(basePrice: number, volatility: number, days = 30) {
  const series: { day: number; price: number }[] = [];
  let price = basePrice * randBetween(0.92, 1.08);

  for (let day = days; day >= 0; day--) {
    // Ordinary drift.
    price *= 1 + randNormal(0, volatility / 4);

    // Occasional shock: a 5% chance per day of a competitor promotion.
    if (Math.random() < 0.05) price *= randBetween(0.85, 0.93);

    // Mean reversion so the walk does not wander to absurdity.
    price += (basePrice - price) * 0.08;

    series.push({ day, price: round2(price) });
  }
  return series;
}
```

**2.3.4** Planted scenarios. This is the part that makes the demo good — a
handful of products are deliberately placed in interesting states:

```ts
export const PLANTED_SCENARIOS = [
  {
    sku: "NW-ELEC-0007",
    label: "Aggressive competitor undercut",
    mutate: (p) => ({ competitorDropPct: 0.15, inventoryLevel: 480 }),
    // Expect: strong decrease recommendation, high confidence, likely auto-execute
  },
  {
    sku: "NW-HOME-0012",
    label: "Margin floor blocks the obvious move",
    mutate: (p) => ({ competitorDropPct: 0.22, cost: p.currentPrice * 0.88 }),
    // Expect: compliance agent BLOCKS or ADJUSTS — the price competitors set
    // is below this org's cost floor. Excellent thing to demo.
  },
  {
    sku: "NW-APPA-0003",
    label: "Demand surge with low stock",
    mutate: (p) => ({ demandSpike: 2.4, inventoryLevel: 11 }),
    // Expect: price INCREASE recommendation — scarcity plus demand
  },
  {
    sku: "MG-OUTD-0005",
    label: "Stale competitor data",
    mutate: (p) => ({ competitorDataAgeDays: 19 }),
    // Expect: confidence penalty applied, routed to human even though the
    // direction is clear. Demonstrates the confidence formula visibly.
  },
  {
    sku: "MG-BEAU-0009",
    label: "Conflicting signals",
    mutate: (p) => ({ competitorDropPct: 0.10, demandSpike: 1.8 }),
    // Expect: agents disagree on direction, disagreement penalty fires,
    // confidence drops below threshold, human review required.
  },
];
```

Document these five in the README. During the interview, being able to say
*"this product is seeded specifically to make the compliance agent block the
recommendation — watch"* is far stronger than clicking around hoping for an
interesting case.

**2.3.5** Pre-seeded recommendations in mixed states so the dashboard is not
empty on first login: roughly 12 per org — 5 PENDING (varied confidence), 3
APPROVED, 2 AUTO_EXECUTED, 1 REJECTED with a reason, 1 MODIFIED. Each with five
plausible `AgentRun` rows so the detail view is populated without spending Groq
calls at seed time.

### Acceptance criteria
- `bun run db:seed` completes in under 30 seconds.
- Exactly 2 orgs, 4 users, ~54 products, ~1,600 competitor price rows, ~320
  demand signals, ~24 recommendations with ~120 agent runs.
- Re-running the seed is idempotent (truncate-then-insert, not duplicate).
- Every planted scenario SKU exists and has the intended data shape.

### Commit
```
feat(seed): add synthetic data generator with planted demo scenarios
```

### Interview note
*"How did you make sure the AI has something meaningful to reason about?"* — Two
things. The generator is category-aware, so margin pressure and volatility differ
by product type rather than being uniform noise. And five SKUs are deliberately
planted in states that exercise specific code paths — a margin floor that blocks
a competitive move, a scarcity-driven price increase, stale data that triggers a
confidence penalty, and two agents that disagree. That means the demo can show a
*range* of agent behaviour rather than the same "drop the price" result five
times.

---

## 2.4 — Mock e-commerce platform endpoint

### Objective
An external system the Execution agent can call, fail against, and roll back from.

### Files touched
```
apps/backend/src/routes/mock.routes.ts
apps/backend/src/services/mockPlatform.service.ts
```

### Implementation

```ts
export async function updatePlatformPrice(sku: string, newPrice: number) {
  // Simulated network latency so loading states are visible in the demo.
  await sleep(env.MOCK_PLATFORM_LATENCY_MS + Math.random() * 300);

  // Deterministic-ish failure so rollback logic is exercised regularly.
  if (Math.random() < env.MOCK_PLATFORM_FAILURE_RATE) {
    throw new AppError("EXECUTION_FAILED", "Platform rejected the price update", {
      sku,
      platformCode: "RATE_LIMIT_EXCEEDED",
      retryable: true,
    });
  }

  return {
    sku,
    price: newPrice,
    platformSyncedAt: new Date().toISOString(),
    platformRef: `PLT-${crypto.randomUUID().slice(0, 8)}`,
  };
}
```

The failure rate is environment-driven so it can be set to `0` for deterministic
E2E tests and `1` for a deliberate rollback demonstration.

### Acceptance criteria
- With `MOCK_PLATFORM_FAILURE_RATE=1`, every execution attempt fails and rolls back.
- With `0`, every attempt succeeds.
- A `PriceExecution` row is written on both outcomes.

### Commit
```
feat(mock): add simulated e-commerce platform api with latency and failure injection
```

---

## 2.5 — Frontend foundation

### Objective
The React app boots, routes, talks to the API with cookies, and knows who is
logged in.

### Files touched
```
apps/frontend/src/main.tsx
apps/frontend/src/routes.tsx
apps/frontend/src/lib/api.ts
apps/frontend/src/lib/queryClient.ts
apps/frontend/src/contexts/AuthContext.tsx
apps/frontend/src/components/layout/*
```

### Implementation

**2.5.1** Setup.

```bash
cd apps/frontend
bun create vite . --template react-ts
bun add react-router-dom @tanstack/react-query react-hook-form @hookform/resolvers zod
bun add recharts lucide-react clsx tailwind-merge date-fns
bun add -d tailwindcss postcss autoprefixer @types/react @types/react-dom
bunx tailwindcss init -p
bunx shadcn@latest init
bunx shadcn@latest add button card table dialog input select badge tabs \
  toast dropdown-menu skeleton alert slider label form separator sheet
```

**2.5.2** The API client. One place that knows about cookies, CSRF and the
envelope.

```ts
// apps/frontend/src/lib/api.ts
const BASE = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  constructor(public code: string, message: string, public details?: unknown, public status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",                 // cookies travel automatically
    headers: {
      "Content-Type": "application/json",
      "X-Pricewise-Client": "web",             // CSRF guard — forms cannot set this
      ...init.headers,
    },
  });

  // 401 on any call means the access token expired. Try one silent refresh,
  // then replay the original request exactly once.
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await attemptRefresh();
    if (refreshed) return request<T>(path, init);
  }

  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.success) {
    throw new ApiError(
      body?.error?.code ?? "NETWORK_ERROR",
      body?.error?.message ?? "Something went wrong",
      body?.error?.details,
      res.status,
    );
  }

  return body.data as T;
}
```

The single-retry guard matters: without it, a genuinely expired session produces
an infinite refresh loop.

**2.5.3** Auth context. Deliberately thin — it holds identity, not server data.

```tsx
export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<MeResponse>("/auth/me"),
    retry: false,          // a 401 here is an answer, not a failure to retry
    staleTime: 5 * 60_000,
  });

  const value = useMemo(() => ({
    user: data?.user ?? null,
    organization: data?.organization ?? null,
    isAuthenticated: Boolean(data?.user),
    isAdmin: data?.user?.role === "ADMIN",
    isLoading,
    refetch,
  }), [data, isLoading, refetch]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

**2.5.4** Route protection with a role gate:

```tsx
function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (role && user?.role !== role) return <ForbiddenPage />;

  return <>{children}</>;
}
```

Note: the frontend role check is **UX only**. The API enforces the same rule
independently. Say this out loud in the interview — hiding a button is not
access control.

**2.5.5** Layout shell — sidebar with role-aware navigation, org name in the
header (which is what makes the two-tenant demo readable at a glance), user menu
with logout.

### Acceptance criteria
- Visiting `/products` unauthenticated redirects to `/login` and returns to
  `/products` after a successful login.
- An ANALYST does not see the Settings nav item, and navigating to `/settings`
  directly shows a forbidden page rather than a blank screen.
- Expiring the access token mid-session triggers exactly one silent refresh and
  the in-flight request succeeds.

### Commit
```
feat(web): add app shell, api client with silent refresh, auth context and route guards
```

---

## 2.6 — Auth pages

### Objective
Signup, login and invite-redemption screens with real validation.

### Files touched
```
apps/frontend/src/pages/LoginPage.tsx
apps/frontend/src/pages/SignupPage.tsx
apps/frontend/src/pages/JoinOrgPage.tsx
apps/frontend/src/components/auth/*
```

### Implementation

React Hook Form plus the **shared** Zod schema — the same object the API uses:

```tsx
const form = useForm<SignupInput>({
  resolver: zodResolver(SignupSchema),      // imported from @pricewise/shared
  defaultValues: { email: "", password: "", name: "", organizationName: "" },
});

const mutation = useMutation({
  mutationFn: (values: SignupInput) => api.post("/auth/signup", values),
  onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["auth","me"] }); navigate("/"); },
  onError: (err: ApiError) => {
    if (err.code === "EMAIL_IN_USE") form.setError("email", { message: err.message });
    else if (err.code === "VALIDATION_ERROR") applyServerFieldErrors(form, err.details);
    else toast.error(err.message);
  },
});
```

`applyServerFieldErrors` maps the API's field-level details back onto the form,
so a server-side rule the client did not know about still lands next to the right
input rather than in a generic toast.

Include on the login page a small "Demo accounts" card listing the four seeded
logins. The assessment says the evaluator should see data immediately; making
them hunt in the README for credentials is friction you can remove in ten
minutes.

### Acceptance criteria
- Submitting a weak password shows the message inline before any network call.
- A duplicate email shows the error on the email field, not as a toast.
- Successful signup lands on the dashboard with the org name visible.
- The demo-accounts card fills the form on click.

### Commit
```
feat(web): add login, signup and join-organization pages with shared schema validation
```

---

## 2.7 — Product catalog UI

### Objective
The screen an analyst actually lives in.

### Files touched
```
apps/frontend/src/pages/ProductsPage.tsx
apps/frontend/src/components/products/ProductTable.tsx
apps/frontend/src/components/products/ProductFilters.tsx
apps/frontend/src/components/products/ProductFormDialog.tsx
apps/frontend/src/components/products/SimulateEventDialog.tsx
apps/frontend/src/hooks/useProducts.ts
```

### Implementation

**2.7.1** The query hook, with filters in the query key so pagination and
filtering cache independently:

```ts
export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: ["products", filters],
    queryFn: () => api.get<Paginated<Product>>(`/products?${toQueryString(filters)}`),
    placeholderData: keepPreviousData,     // table does not flash empty on page change
    staleTime: 30_000,
  });
}
```

**2.7.2** Filter state in the URL, not component state:

```ts
const [params, setParams] = useSearchParams();
```

This costs nothing extra and means a filtered view is shareable and survives
refresh — the kind of detail that reads as product thinking rather than
tutorial-following.

**2.7.3** Table columns:

| Column | Notes |
|---|---|
| SKU | monospace |
| Name | truncates with tooltip |
| Category | badge |
| Current price | right-aligned, currency-formatted |
| Last competitor price | with a delta chip: green if we are cheaper, red if dearer |
| Margin | computed client-side from the same formula, shown as % with a warning icon if below the floor |
| Inventory | numeric plus a status badge (LOW / NORMAL / OVERSTOCKED) |
| Recommendation | badge: none / pending with confidence / approved / auto-executed |
| Actions | Generate, Edit (admin), Simulate event |

**2.7.4** The three states the assessment explicitly asks for:

- **Loading** — skeleton rows matching the real column widths, not a spinner, so
  the layout does not jump.
- **Empty** — distinguish "no products yet" (offer the seed command / Add
  Product) from "no results for this filter" (offer Clear filters). These are
  different user situations and deserve different copy.
- **Error** — inline retry with the message from the envelope.

### Acceptance criteria
- Filtering, sorting, searching and paging all update the URL and survive reload.
- Loading shows skeletons of the correct shape.
- Both empty states are reachable and render distinct copy.
- Add/Edit/Delete are absent for ANALYST and present for ADMIN.

### Commit
```
feat(web): add product catalog page with filtering, sorting, pagination and empty states
```

---

## 2.8 — Frontend test setup

### Objective
Vitest running, with the first meaningful component tests.

### Files touched
```
apps/frontend/vitest.config.ts
apps/frontend/src/test/setup.ts
apps/frontend/src/test/renderWithProviders.tsx
apps/frontend/src/components/products/__tests__/ProductTable.test.tsx
```

### Implementation

A `renderWithProviders` helper that wraps a component in a fresh QueryClient
(with retries disabled), a MemoryRouter and a mock AuthProvider, so every test
starts from a clean cache and a known role.

First tests worth writing:
- Margin warning icon appears when margin is below the product's floor.
- Competitor delta chip is green when our price is lower, red when higher.
- Admin-only action buttons render for ADMIN and not for PRICING_ANALYST.
- Empty state copy differs with and without active filters.

### Acceptance criteria
- `bun run --cwd apps/frontend test` passes.
- Tests do not hit the network.

### Commit
```
test(web): add vitest setup and product table component tests
```

---
# Phase 3 — The AI agent pipeline

This is the phase the assessment weights most heavily under "AI Integration
Quality" (25%). The distinguishing claim is that this is **not** a prompt-in /
text-out wrapper: five agents with distinct responsibilities, real tool calling,
schema-validated hand-offs, a deterministic confidence model, and streamed
progress.

**Duration estimate:** 11 hours

---

## 3.0 — Design principles for this phase

Before any code, four rules that shape every agent below.

**P1 — Agents exchange validated JSON, never prose.**
Agent B does not receive Agent A's paragraph. It receives a parsed object that
satisfied a Zod schema. If the object fails validation, the pipeline knows
immediately and locally, rather than a downstream agent silently
misinterpreting free text.

**P2 — The LLM supplies judgement; code supplies arithmetic.**
The model decides *whether* competitor pressure is meaningful. It does not
compute the final confidence score, and it does not decide whether the price
clears the margin floor. Those are deterministic functions in TypeScript, which
means they are testable, reproducible and explainable.

**P3 — Tool calling is real, not decorative.**
Each agent is given a set of tools and decides which to invoke. The Market
Intelligence agent asked only about recent news does not call price history. The
assessment explicitly requires the LLM to decide, not follow a hardcoded
sequence — so the orchestrator must not pre-fetch everything and stuff it into
the prompt.

**P4 — Every agent invocation is persisted.**
Input, output, model, token counts, duration, and error. This is what powers the
explainability view, and it is also how you debug a bad recommendation after the
fact.

---

## 3.1 — The Groq client wrapper

### Objective
One function, `runAgent()`, that every agent uses: prompt + tools + output schema
in, validated typed object out, with timeout, retry, and tool-loop handling.

### Files touched
```
apps/backend/src/agents/groqClient.ts
apps/backend/src/agents/types.ts
```

### Implementation

**3.1.1** Install and pin models. Check the current model list in the Groq
console rather than trusting a hardcoded name from memory — model identifiers
change, and a stale one produces a confusing 404 at runtime.

```bash
bun add groq-sdk
```

**3.1.2** The tool-calling loop, written by hand. This is the block you must be
able to explain line by line.

```ts
// apps/backend/src/agents/groqClient.ts
import Groq from "groq-sdk";
import { z, type ZodSchema } from "zod";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { AppError } from "../lib/errors";

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;      // JSON Schema for the model
  argsSchema: ZodSchema<TArgs>;             // Zod, for validating what comes back
  execute: (args: TArgs, ctx: ToolContext) => Promise<unknown>;
}

export interface RunAgentOptions<TOut> {
  agentName: AgentName;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDefinition<never>[];
  outputSchema: ZodSchema<TOut>;
  ctx: ToolContext;
  maxToolRounds?: number;
}

export interface RunAgentResult<TOut> {
  output: TOut;
  toolCalls: { name: string; args: unknown; durationMs: number }[];
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  rounds: number;
}

export async function runAgent<TOut>(opts: RunAgentOptions<TOut>): Promise<RunAgentResult<TOut>> {
  const started = Date.now();
  const maxRounds = opts.maxToolRounds ?? 4;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user",   content: opts.userPrompt },
  ];

  const toolSpecs = opts.tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const toolCalls: RunAgentResult<TOut>["toolCalls"] = [];
  let promptTokens = 0, completionTokens = 0, rounds = 0;

  while (rounds < maxRounds) {
    rounds++;

    const completion = await withTimeoutAndRetry(
      () => groq.chat.completions.create({
        model: opts.model,
        messages,
        ...(toolSpecs.length ? { tools: toolSpecs, tool_choice: "auto" } : {}),
        temperature: 0.2,                         // low: this is analysis, not prose
        response_format: rounds === maxRounds || !toolSpecs.length
          ? { type: "json_object" }               // force JSON on the final round
          : undefined,
      }),
      opts.agentName,
    );

    promptTokens     += completion.usage?.prompt_tokens ?? 0;
    completionTokens += completion.usage?.completion_tokens ?? 0;

    const choice = completion.choices[0];
    if (!choice?.message) throw new AppError("LLM_UNAVAILABLE", "Empty completion from model");

    const requested = choice.message.tool_calls ?? [];

    // No tools requested → the model is answering. Parse and return.
    if (requested.length === 0) {
      const parsed = parseAgentOutput(choice.message.content, opts.outputSchema, opts.agentName);
      return {
        output: parsed, toolCalls, promptTokens, completionTokens,
        durationMs: Date.now() - started, rounds,
      };
    }

    // The model asked for tools. Push its request, run them, push results.
    messages.push(choice.message);

    // Tools within one round are independent, so run them concurrently.
    const results = await Promise.all(
      requested.map(async (call) => {
        const tool = opts.tools.find((t) => t.name === call.function.name);
        const t0 = Date.now();

        if (!tool) {
          return { id: call.id, content: JSON.stringify({ error: `Unknown tool: ${call.function.name}` }) };
        }

        try {
          const rawArgs = JSON.parse(call.function.arguments || "{}");
          const args = tool.argsSchema.parse(rawArgs);
          const result = await tool.execute(args as never, opts.ctx);
          toolCalls.push({ name: tool.name, args, durationMs: Date.now() - t0 });
          return { id: call.id, content: JSON.stringify(result) };
        } catch (err) {
          // A failed tool is reported back to the model as data, not thrown.
          // The model can then reason about the gap rather than the whole
          // pipeline dying because one data source was unavailable.
          logger.warn({ agent: opts.agentName, tool: call.function.name, err }, "tool call failed");
          toolCalls.push({ name: tool.name, args: null, durationMs: Date.now() - t0 });
          return { id: call.id, content: JSON.stringify({ error: String(err), available: false }) };
        }
      }),
    );

    for (const r of results) {
      messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
    }
  }

  throw new AppError("AGENT_TIMEOUT", `${opts.agentName} exceeded ${maxRounds} tool rounds`);
}
```

**3.1.3** Output parsing with one schema-repair retry. Worth the extra call: a
model that returned a nearly-right object usually fixes it when shown the exact
validation error.

```ts
function parseAgentOutput<T>(content: string | null, schema: ZodSchema<T>, agent: AgentName): T {
  if (!content) throw new AppError("LLM_UNAVAILABLE", `${agent} returned no content`);

  // Models occasionally wrap JSON in a markdown fence despite instructions.
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    // Last resort: pull the outermost brace-balanced object out of the text.
    const extracted = extractFirstJsonObject(cleaned);
    if (!extracted) throw new AppError("LLM_UNAVAILABLE", `${agent} returned unparseable output`);
    raw = extracted;
  }

  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  throw new SchemaRepairNeeded(agent, raw, result.error);
}
```

The orchestrator catches `SchemaRepairNeeded` once per agent, re-runs with the
validation error appended to the user prompt, and fails the agent on a second
failure.

**3.1.4** Timeout and backoff.

```ts
async function withTimeoutAndRetry<T>(fn: () => Promise<T>, agent: AgentName): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= env.AGENT_MAX_RETRIES; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new AppError("AGENT_TIMEOUT", `${agent} timed out`)), env.AGENT_TIMEOUT_MS)),
      ]);
    } catch (err) {
      lastErr = err;
      const retryable = isRateLimit(err) || isServerError(err) || isTimeout(err);
      if (!retryable || attempt === env.AGENT_MAX_RETRIES) break;

      // 1s, 4s — plus jitter so parallel agents do not retry in lockstep.
      const delay = 1000 * Math.pow(4, attempt) + Math.random() * 500;
      logger.warn({ agent, attempt, delay }, "retrying agent call");
      await sleep(delay);
    }
  }

  throw lastErr instanceof AppError ? lastErr : new AppError("LLM_UNAVAILABLE", String(lastErr));
}
```

### Acceptance criteria
- Unit test with a mocked Groq returning a plain JSON answer → parsed output, zero tool calls.
- Mocked Groq requesting two tools in one round → both execute concurrently, results appended as `tool` messages, loop continues.
- A tool that throws → error surfaced to the model as JSON, pipeline continues.
- Mocked 429 → two retries with increasing delay, then success.
- Malformed JSON output → `SchemaRepairNeeded` thrown, not a crash.
- Exceeding `maxToolRounds` → `AGENT_TIMEOUT`.

### Commit
```
feat(agents): add groq client with hand-rolled tool loop, timeout, retry and schema repair
```

### Interview note
*"Why did you write the tool loop yourself rather than using a framework?"* —
Two reasons. First, the assessment says I must be able to explain every major
block, and a loop I wrote is one I can walk through line by line. Second, the
loop is genuinely small — about sixty lines — and the value a framework adds here
is mostly provider abstraction, which I do not need because I chose one provider
deliberately. What I gained is precise control over three things that mattered:
running tools within a round concurrently, reporting tool failures back to the
model as data rather than aborting, and forcing JSON mode on the final round.

---

## 3.2 — Tool definitions

### Objective
Four tools the agents can call, each a thin wrapper over a tenant-scoped service.

### Files touched
```
apps/backend/src/agents/tools/getCompetitorPrices.ts
apps/backend/src/agents/tools/getPriceHistory.ts
apps/backend/src/agents/tools/getDemandTrends.ts
apps/backend/src/agents/tools/getInventoryAndCost.ts
apps/backend/src/agents/tools/updateEcommercePrice.ts
apps/backend/src/agents/tools/index.ts
```

### Implementation

**3.2.1** Every tool carries `ToolContext`, which carries `orgId`. A tool
therefore physically cannot read another tenant's data, because the underlying
repository call requires the scoped id.

```ts
export interface ToolContext {
  orgId: string;
  productId: string;
  requestId: string;
}
```

**3.2.2** Example tool, fully specified:

```ts
export const getCompetitorPrices: ToolDefinition<{ lookbackDays: number }> = {
  name: "get_competitor_prices",
  description:
    "Fetch recent competitor prices for the product under analysis. Returns each " +
    "competitor's latest price, the age of that observation in days, and summary " +
    "statistics. Call this when you need to know what the market is charging.",
  parameters: {
    type: "object",
    properties: {
      lookbackDays: {
        type: "number",
        description: "How many days of competitor observations to consider. Use 7 for current market state, 30 for trend analysis.",
        minimum: 1,
        maximum: 90,
      },
    },
    required: ["lookbackDays"],
  },
  argsSchema: z.object({ lookbackDays: z.number().int().min(1).max(90) }),

  async execute({ lookbackDays }, ctx) {
    const rows = await competitorRepo.findRecent(ctx.orgId, ctx.productId, lookbackDays);

    if (rows.length === 0) {
      return { available: false, reason: "No competitor observations in the requested window" };
    }

    const latestPerCompetitor = groupLatest(rows);
    const prices = latestPerCompetitor.map((r) => r.price);

    return {
      available: true,
      observationCount: rows.length,
      competitors: latestPerCompetitor.map((r) => ({
        name: r.competitor,
        price: r.price,
        ageDays: daysSince(r.scrapedAt),
      })),
      summary: {
        min: Math.min(...prices),
        median: median(prices),
        max: Math.max(...prices),
        oldestObservationDays: Math.max(...latestPerCompetitor.map((r) => daysSince(r.scrapedAt))),
      },
    };
  },
};
```

Two details worth noting in the interview:

- The **description text is part of the engineering**. It tells the model *when*
  to call the tool and what the parameter means. A vague description is the most
  common cause of an agent calling the wrong tool or passing nonsense arguments.
- The tool returns `{ available: false, reason }` rather than throwing when there
  is no data. The model can then say "competitor data is unavailable, confidence
  reduced" instead of the pipeline failing.

**3.2.3** The write tool is different — it has side effects, so it is only ever
given to the Execution & Compliance agent, and it records a `PriceExecution` row
regardless of outcome.

### Acceptance criteria
- Each tool returns `{ available: false }` rather than throwing on empty data.
- `getCompetitorPrices` for Org A's product with Org B's ctx returns nothing.
- `updateEcommercePrice` writes a `PriceExecution` row on both success and failure.

### Commit
```
feat(agents): add four read tools and one write tool with tenant-scoped contexts
```

---

## 3.3 — Agent 1: Market Intelligence

### Objective
Turn raw competitor observations into a structured view of market position.

### Files touched
```
apps/backend/src/agents/definitions/marketIntelligence.ts
```

### Implementation

**3.3.1** The system prompt. Written deliberately, with each paragraph doing a
job:

```ts
export const MARKET_INTEL_SYSTEM = `
You are the Market Intelligence Agent in a pricing system for an e-commerce retailer.

YOUR SOLE RESPONSIBILITY
Establish where this product sits relative to competitors, and how that position is
changing. You do NOT recommend a price. You do NOT consider inventory or cost.
Another agent does that. Stay in your lane — a downstream agent depends on your
output being narrowly about market position.

HOW TO WORK
1. Call get_competitor_prices to establish the current market position.
2. If, and only if, you need to determine a trend direction rather than a snapshot,
   call get_price_history.
3. Do not call a tool whose output you will not use. Unnecessary calls cost latency.

JUDGING DATA QUALITY
Report dataAgeDays as the age of the OLDEST observation you relied on. If the data
is older than 7 days, say so in your notes and lower your confidence accordingly.
If a tool reports available: false, do not invent numbers — report what you have and
set confidence below 0.4.

CONFIDENCE
Report your own confidence in YOUR analysis only, from 0 to 1:
  0.9-1.0  Fresh data from 3+ competitors, consistent picture
  0.7-0.9  Fresh data, but fewer competitors or mild inconsistency
  0.4-0.7  Data is stale (7-14 days) or sparse
  0.0-0.4  Data missing, contradictory, or older than 14 days

OUTPUT
Respond with a single JSON object and nothing else. No markdown fence, no preamble.
{
  "competitorMin": number,
  "competitorMedian": number,
  "competitorMax": number,
  "trend": "rising" | "falling" | "stable",
  "newEntrants": string[],
  "dataAgeDays": number,
  "notes": string,        // 2-3 sentences, factual, no recommendation
  "confidence": number
}
`.trim();
```

**3.3.2** The user prompt is built per product and contains only facts, never
instructions — instructions live in the system prompt so they are cached and
consistent:

```ts
export function buildMarketIntelUserPrompt(product: Product) {
  return [
    `Product under analysis:`,
    `  SKU: ${product.sku}`,
    `  Name: ${product.name}`,
    `  Category: ${product.category}`,
    `  Our current price: ${fmt(product.currentPrice)}`,
    ``,
    `Determine our market position.`,
  ].join("\n");
}
```

**3.3.3** Model selection: this agent is mechanical — read numbers, summarise,
classify a trend. Use `GROQ_MODEL_FAST`.

### Acceptance criteria
- With three competitors seeded and one at 15% below, output has
  `trend: "falling"` and `competitorMin` matching the seeded value.
- With all competitor rows older than 14 days, `confidence < 0.4` and
  `dataAgeDays > 14`.
- With `get_competitor_prices` returning `available: false`, the agent does not
  fabricate numbers.

### Commit
```
feat(agents): implement market intelligence agent with tool-driven analysis
```

### Interview note
*"How do you stop an agent doing another agent's job?"* — Three mechanisms. The
system prompt says explicitly what it must not consider. The output schema has no
field for a recommended price, so an out-of-scope opinion has nowhere to go and
fails validation. And the agent is only given the tools relevant to its
responsibility — it cannot read inventory because it has no inventory tool.

---

## 3.4 — Agent 2: Inventory & Cost

### Objective
Establish the hard constraints: what we may not price below, and what the stock
position implies.

### Files touched
```
apps/backend/src/agents/definitions/inventoryCost.ts
```

### Implementation

The distinguishing feature of this agent is that its most important output,
`absoluteFloorPrice`, is **computed in code and given to the model**, not
computed by the model.

```ts
export function buildInventoryUserPrompt(product: Product, rule: CategoryRule | null) {
  const floorPct = rule?.marginFloorPct ?? product.marginFloorPct;
  const floorPrice = Number(product.cost) / (1 - floorPct);   // computed here, deterministically

  return [
    `Product: ${product.sku} — ${product.name} (${product.category})`,
    `Current price: ${fmt(product.currentPrice)}`,
    `Unit cost (COGS): ${fmt(product.cost)}`,
    `Margin floor for this category: ${(floorPct * 100).toFixed(1)}%`,
    `Computed absolute floor price: ${fmt(floorPrice)}  <- do not recalculate this, use it`,
    `Inventory on hand: ${product.inventoryLevel} units`,
    ``,
    `Call get_inventory_and_cost for velocity and days-of-cover, then assess the constraint picture.`,
  ].join("\n");
}
```

The comment in the prompt is not decoration. LLMs are unreliable at arithmetic,
and a wrong floor price is the one error in this system that could cause a
below-cost sale. Computing it in TypeScript and instructing the model to pass it
through removes that risk entirely while still letting the model reason about
what the constraint *means*.

System prompt emphasis:

```
You are the Inventory & Cost Agent. You establish CONSTRAINTS, not recommendations.

You will be given a pre-computed absoluteFloorPrice. Echo it exactly in your output.
Do not recalculate it. If your own reasoning suggests a different number, the given
value still wins — it was computed from authoritative cost data.

Flag a constraint when:
  - days of cover is under 14 (scarcity — a price increase may be warranted)
  - days of cover is over 120 (overstock — clearance pressure)
  - current price is within 5% of the floor (little room to discount)
```

### Acceptance criteria
- Output `absoluteFloorPrice` equals the computed value to two decimal places in
  every test case.
- Inventory of 8 units with normal velocity produces a LOW status and a scarcity
  constraint.
- Inventory of 600 units produces OVERSTOCKED and a clearance constraint.
- A product priced 3% above its floor produces a "limited discount headroom"
  constraint.

### Commit
```
feat(agents): implement inventory and cost agent with code-computed price floor
```

### Interview note
*"What stops the AI recommending a price below cost?"* — Three independent
layers, and I would not rely on any one of them. The floor price is computed in
TypeScript and handed to the agent rather than derived by it. The Execution &
Compliance agent re-checks the final price against the floor. And the execution
service performs a final deterministic check before calling the platform API, so
even a compromised or hallucinating agent cannot push a below-floor price.

---

## 3.5 — Agent 3: Demand Forecasting

### Objective
Estimate how volume responds to a price change, given the market context the
first agent established.

### Files touched
```
apps/backend/src/agents/definitions/demandForecasting.ts
```

### Implementation

This is the first agent that consumes another agent's output, so the hand-off
format matters:

```ts
export function buildDemandUserPrompt(product: Product, marketIntel: MarketIntelOutput) {
  return [
    `Product: ${product.sku} — ${product.name} (${product.category})`,
    `Our price: ${fmt(product.currentPrice)}`,
    ``,
    `MARKET INTELLIGENCE AGENT REPORTED:`,
    JSON.stringify(marketIntel, null, 2),
    ``,
    `Note: that agent's confidence was ${marketIntel.confidence}. If it is below 0.5,`,
    `treat its figures as indicative only and reflect that in your own confidence.`,
    ``,
    `Call get_demand_trends, then forecast demand response.`,
  ].join("\n");
}
```

Passing upstream confidence downstream is what makes the pipeline
*collaborative* rather than merely sequential. An agent working from shaky input
should not report firm output, and saying so explicitly in the prompt is how you
get that behaviour reliably.

Elasticity guidance in the system prompt, because an unguided model returns
wildly inconsistent magnitudes:

```
ELASTICITY CONVENTION
Report price elasticity of demand as a NEGATIVE number for normal goods.
  -0.5   inelastic  (necessities, strong brand loyalty, few substitutes)
  -1.0   unit elastic
  -2.0   elastic    (commodity electronics, many substitutes, easy comparison)
  -3.5   highly elastic (undifferentiated goods, price-driven category)

Anchor on the category:
  Electronics, commodity  -> -1.8 to -3.0
  Apparel, branded        -> -1.0 to -1.8
  Beauty, habitual        -> -0.6 to -1.2
  Home, considered        -> -1.2 to -2.0
Adjust from that anchor based on the demand signals you retrieve.
```

### Acceptance criteria
- Elasticity is always negative for these categories.
- Electronics returns a more negative elasticity than Beauty for comparable signals.
- Given `marketIntel.confidence = 0.3`, this agent's own confidence is at most 0.6.
- A seeded demand spike produces `velocityTrend: "accelerating"`.

### Commit
```
feat(agents): implement demand forecasting agent consuming market intel output
```

---

## 3.6 — Agent 4: Pricing Strategy

### Objective
Synthesise three upstream analyses into one recommended price with a written
rationale and explicit factor weights.

### Files touched
```
apps/backend/src/agents/definitions/pricingStrategy.ts
```

### Implementation

This agent has **no tools**. It is pure synthesis — everything it needs is
already in its prompt. That is a deliberate design statement: giving it tools
would let it re-fetch and possibly contradict what the specialist agents
concluded.

```ts
export function buildStrategyUserPrompt(
  product: Product,
  market: MarketIntelOutput,
  demand: DemandOutput,
  inventory: InventoryOutput,
  org: { maxPriceDeltaPct: number },
) {
  return [
    `PRODUCT`,
    `  ${product.sku} — ${product.name} (${product.category})`,
    `  Current price: ${fmt(product.currentPrice)}`,
    ``,
    `HARD CONSTRAINTS (violating these invalidates your recommendation)`,
    `  Absolute floor price: ${fmt(inventory.absoluteFloorPrice)}`,
    `  Maximum change from current price: ±${(org.maxPriceDeltaPct * 100).toFixed(0)}%`,
    `  → permitted range: ${fmt(lower)} to ${fmt(upper)}`,
    ``,
    `MARKET INTELLIGENCE (confidence ${market.confidence})`,
    JSON.stringify(market, null, 2),
    ``,
    `DEMAND FORECAST (confidence ${demand.confidence})`,
    JSON.stringify(demand, null, 2),
    ``,
    `INVENTORY & COST (confidence ${inventory.confidence})`,
    JSON.stringify(inventory, null, 2),
    ``,
    `Produce one recommended price within the permitted range.`,
  ].join("\n");
}
```

System prompt — the reasoning framework is explicit, which is what produces
consistent rationales rather than vibes:

```
You are the Pricing Strategy Agent. Three specialist agents have reported to you.
Your job is synthesis, not re-analysis. You have no tools; work only with what you
were given.

REASONING FRAMEWORK — work through these in order:
1. What does the market position alone suggest? (competitor median vs our price)
2. Does the demand forecast amplify or oppose that suggestion?
3. Do inventory constraints permit it? Overstock argues for aggression,
   scarcity argues for restraint or increase.
4. Where does the margin floor bind?
5. Settle on a price inside the permitted range.

FACTOR WEIGHTS
Report how much each factor drove your decision. The four weights must sum to 1.0.
This is not a formality — it is rendered in the UI so a human can see what drove
the recommendation. Be honest: if inventory was irrelevant, weight it near zero.

WHEN AGENTS DISAGREE
If market says "falling" but demand says "accelerating", do not average them.
Say in your rationale which signal you prioritised and why. A human reviewer needs
to be able to disagree with your judgement, which requires seeing it stated.

RATIONALE
Write 3-5 sentences a pricing analyst would find useful. Reference specific numbers
from the agent reports. Never write "the AI recommends" — state the business case.

CONFIDENCE
Rate confidence in YOUR SYNTHESIS, independent of the upstream confidences
(those are combined separately by the system).
```

**3.6.1** Post-validation clamp. Even with the constraint stated, clamp in code:

```ts
const clamped = clamp(output.recommendedPrice, floorPrice, upperBound);
if (clamped !== output.recommendedPrice) {
  logger.warn({ productId, proposed: output.recommendedPrice, clamped }, "strategy agent output clamped");
  output.recommendedPrice = clamped;
  output.confidence = Math.min(output.confidence, 0.6);   // it broke a stated rule
}
```

Reducing confidence when a clamp fires is a nice touch: an agent that ignored an
explicit constraint has demonstrated it is less reliable on this case.

### Acceptance criteria
- `factorWeights` sum to 1.0 ± 0.02 (assert with tolerance; models round).
- Recommended price always within `[floor, current × (1 + maxDelta)]`.
- Overstock plus falling market produces `direction: "decrease"`.
- Scarcity plus accelerating demand produces `direction: "increase"`.
- Conflicting inputs produce a rationale that names the conflict.
- Model: `GROQ_MODEL_STRONG`.

### Commit
```
feat(agents): implement pricing strategy synthesis agent with factor weighting
```

---

## 3.7 — Agent 5: Execution & Compliance

### Objective
Validate the recommendation against business rules and either execute it or route
it to a human.

### Files touched
```
apps/backend/src/agents/definitions/executionCompliance.ts
apps/backend/src/services/execution.service.ts
```

### Implementation

**3.7.1** Deterministic rule checks run **before** the agent, in code. The agent
is asked to interpret and explain, not to be the enforcement mechanism.

```ts
export function checkBusinessRules(
  product: Product,
  proposedPrice: number,
  org: Organization,
  categoryRule: CategoryRule | null,
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const cost = Number(product.cost);
  const current = Number(product.currentPrice);
  const floorPct = categoryRule?.marginFloorPct ?? product.marginFloorPct;
  const maxDelta = categoryRule?.maxDeltaPct ?? org.maxPriceDeltaPct;

  if (proposedPrice <= cost) {
    violations.push({ rule: "BELOW_COST", severity: "block",
      detail: `Proposed ${fmt(proposedPrice)} is at or below unit cost ${fmt(cost)}` });
  }

  const margin = (proposedPrice - cost) / proposedPrice;
  if (margin < floorPct) {
    violations.push({ rule: "MARGIN_FLOOR", severity: "block",
      detail: `Margin ${(margin*100).toFixed(1)}% is below the ${(floorPct*100).toFixed(1)}% floor` });
  }

  const delta = Math.abs(proposedPrice - current) / current;
  if (delta > maxDelta) {
    violations.push({ rule: "MAX_DELTA", severity: "adjust",
      detail: `Change of ${(delta*100).toFixed(1)}% exceeds the ${(maxDelta*100).toFixed(0)}% limit` });
  }

  if (proposedPrice < 0.99) {
    violations.push({ rule: "MINIMUM_PRICE", severity: "block", detail: "Below platform minimum" });
  }

  return violations;
}
```

**3.7.2** The agent's role is then narrow and honest:

```
You are the Execution & Compliance Agent.

A deterministic rule engine has already run. Its findings are given to you as
`violations`. You do NOT re-run those checks and you cannot overrule a violation
marked "block".

Your job:
  - decision "block"  if any violation has severity "block"
  - decision "adjust" if violations are all severity "adjust" — return the nearest
    compliant price as finalPrice
  - decision "allow"  if there are no violations — finalPrice equals the
    recommended price exactly

Then explain, in two sentences, what a human reviewer needs to understand about
this decision. Reference the specific rule by name when a violation fired.
```

This is a defensible design and worth saying plainly in the interview: the agent
is not the safety mechanism. The rule engine is. The agent makes the outcome
*legible*.

**3.7.3** Execution with rollback:

```ts
export async function executeRecommendation(
  orgId: string, recommendationId: string, price: number, actorId: string | null,
) {
  const rec = await recRepo.findById(orgId, recommendationId);
  if (!rec) throw notFound("Recommendation");

  const product = await productRepo.findById(orgId, rec.productId);
  if (!product) throw notFound("Product");

  const previousPrice = product.currentPrice;

  // Final deterministic gate. Agents have already approved, but this is the
  // last line of defence before money is affected.
  const violations = checkBusinessRules(product, price, org, categoryRule);
  const blocking = violations.filter((v) => v.severity === "block");
  if (blocking.length) {
    throw new AppError("EXECUTION_FAILED", "Blocked by business rules", { violations: blocking });
  }

  // Optimistic local write, then push to the platform.
  await productRepo.updatePrice(orgId, product.id, price);

  try {
    const platformResult = await mockPlatform.updatePlatformPrice(product.sku, price);

    await prisma.priceExecution.create({
      data: { recommendationId, attemptedPrice: price, succeeded: true,
              platformResponse: platformResult, rolledBack: false },
    });

    await auditService.record({
      orgId, userId: actorId,
      action: actorId ? "PRICE_APPROVED_AND_EXECUTED" : "PRICE_AUTO_EXECUTED",
      entityType: "Product", entityId: product.id,
      beforeValue: { price: previousPrice }, afterValue: { price },
    });

    return { executed: true, platformRef: platformResult.platformRef };

  } catch (err) {
    // Roll back the local write so the database never claims a price the
    // platform does not have.
    await productRepo.updatePrice(orgId, product.id, Number(previousPrice));

    await prisma.priceExecution.create({
      data: { recommendationId, attemptedPrice: price, succeeded: false,
              platformResponse: { error: String(err) }, rolledBack: true },
    });

    await auditService.record({
      orgId, userId: actorId, action: "PRICE_EXECUTION_FAILED",
      entityType: "Product", entityId: product.id,
      beforeValue: { price: previousPrice }, afterValue: { attemptedPrice: price, rolledBack: true },
    });

    throw new AppError("EXECUTION_FAILED", "Platform rejected the price update; change rolled back");
  }
}
```

### Acceptance criteria
- A below-floor price is blocked even if the strategy agent proposed it.
- A 30% change with a 20% limit produces `decision: "adjust"` and a finalPrice at
  exactly the 20% bound.
- With `MOCK_PLATFORM_FAILURE_RATE=1`, the product price returns to its original
  value and a `PriceExecution` row records `rolledBack: true`.
- Both success and failure write an AuditLog row.

### Commit
```
feat(agents): implement execution and compliance agent with rule engine and rollback
```

---

## 3.8 — Confidence aggregation

### Objective
A deterministic, explainable confidence score.

### Files touched
```
apps/backend/src/agents/confidence.ts
```

### Implementation

```ts
export interface ConfidenceInputs {
  market: MarketIntelOutput | null;
  demand: DemandOutput | null;
  inventory: InventoryOutput | null;
  strategy: StrategyOutput;
  priceDeltaPct: number;
  failedAgents: AgentName[];
}

export interface ConfidenceBreakdown {
  base: number;
  penalties: { reason: string; amount: number }[];
  final: number;
}

const WEIGHTS = { market: 0.30, demand: 0.25, inventory: 0.25, strategy: 0.20 };

export function computeConfidence(i: ConfidenceInputs): ConfidenceBreakdown {
  // Weighted mean over agents that actually produced output. If one failed,
  // its weight is redistributed rather than counted as zero — a missing input
  // is handled by an explicit penalty below, not by silently halving the score.
  let weightSum = 0, acc = 0;
  const add = (v: number | undefined, w: number) => {
    if (v === undefined) return;
    acc += v * w; weightSum += w;
  };
  add(i.market?.confidence,    WEIGHTS.market);
  add(i.demand?.confidence,    WEIGHTS.demand);
  add(i.inventory?.confidence, WEIGHTS.inventory);
  add(i.strategy.confidence,   WEIGHTS.strategy);

  const base = weightSum > 0 ? acc / weightSum : 0;
  const penalties: { reason: string; amount: number }[] = [];

  if (i.market && i.market.dataAgeDays > 7) {
    penalties.push({ reason: `Competitor data is ${Math.round(i.market.dataAgeDays)} days old`, amount: 0.15 });
  }
  if (i.market && i.demand && signalsDisagree(i.market, i.demand)) {
    penalties.push({ reason: "Market trend and demand trend point in opposite directions", amount: 0.10 });
  }
  for (const agent of i.failedAgents) {
    penalties.push({ reason: `${displayName(agent)} did not complete`, amount: 0.20 });
  }
  if (Math.abs(i.priceDeltaPct) > 0.15) {
    penalties.push({ reason: `Large price change (${(i.priceDeltaPct*100).toFixed(1)}%)`, amount: 0.10 });
  }
  if (i.inventory?.constraints.length) {
    penalties.push({ reason: `${i.inventory.constraints.length} inventory constraint(s) active`, amount: 0.05 });
  }

  const total = penalties.reduce((s, p) => s + p.amount, 0);
  return { base, penalties, final: clamp(base - total, 0, 1) };
}

function signalsDisagree(m: MarketIntelOutput, d: DemandOutput): boolean {
  return (m.trend === "falling" && d.velocityTrend === "accelerating")
      || (m.trend === "rising"  && d.velocityTrend === "decelerating");
}
```

The `ConfidenceBreakdown` is persisted on the recommendation and rendered in the
UI as a waterfall: base score, each penalty as a labelled deduction, final score.
This is the "Explainability Dashboard" bonus item, achieved almost for free
because the score was designed to be explainable from the start.

### Acceptance criteria
- All agents at 0.9, no penalties → final 0.9.
- One failed agent → its weight is redistributed and a 0.20 penalty applied.
- Stale data plus disagreement plus large delta → three labelled penalties.
- Result is always within [0, 1].
- Function is pure — same inputs, same output, no I/O.

### Commit
```
feat(agents): add deterministic confidence aggregation with explainable penalties
```

### Interview note
*"Why not just ask the model for a confidence score?"* — Because a model's
self-reported confidence is not calibrated and is not reproducible; ask twice and
you get two numbers. Here each agent reports confidence in its own narrow
analysis, which models are comparatively decent at, and the *combination* is
arithmetic. The result is reproducible, unit-testable, and — most importantly for
a human-in-the-loop product — explainable as a list of named deductions rather
than an opaque number.

---

## 3.9 — The orchestrator

### Objective
Run the five agents in the right order, emit progress, persist everything.

### Files touched
```
apps/backend/src/agents/orchestrator.ts
```

### Implementation

```ts
export async function* orchestrate(
  orgId: string, productId: string, requestId: string,
): AsyncGenerator<PipelineEvent, void, undefined> {

  const [product, org, categoryRule] = await Promise.all([
    productRepo.findById(orgId, productId),
    orgRepo.findById(orgId),
    categoryRuleRepo.find(orgId, /* category */),
  ]);
  if (!product) throw notFound("Product");

  const recommendation = await recRepo.createPending(orgId, product);
  const ctx: ToolContext = { orgId, productId, requestId };
  const failed: AgentName[] = [];

  // ---- WAVE 1: independent agents, concurrent -------------------------
  yield { type: "agent_started", agent: "MARKET_INTELLIGENCE" };
  yield { type: "agent_started", agent: "INVENTORY_COST" };

  const [marketResult, inventoryResult] = await Promise.allSettled([
    runAndPersist("MARKET_INTELLIGENCE", recommendation.id, () =>
      runAgent({ ...marketIntelConfig(product), ctx })),
    runAndPersist("INVENTORY_COST", recommendation.id, () =>
      runAgent({ ...inventoryConfig(product, categoryRule), ctx })),
  ]);

  const market = unwrap(marketResult, "MARKET_INTELLIGENCE", failed);
  yield emitResult("MARKET_INTELLIGENCE", marketResult);

  const inventory = unwrap(inventoryResult, "INVENTORY_COST", failed);
  yield emitResult("INVENTORY_COST", inventoryResult);

  // ---- WAVE 2: demand depends on market -------------------------------
  let demand: DemandOutput | null = null;
  if (market) {
    yield { type: "agent_started", agent: "DEMAND_FORECASTING" };
    const r = await runAndPersist("DEMAND_FORECASTING", recommendation.id, () =>
      runAgent({ ...demandConfig(product, market), ctx }));
    demand = unwrap(r, "DEMAND_FORECASTING", failed);
    yield emitResult("DEMAND_FORECASTING", r);
  } else {
    // Degrade rather than abort: strategy is told the input is missing.
    failed.push("DEMAND_FORECASTING");
    yield { type: "agent_skipped", agent: "DEMAND_FORECASTING",
            reason: "Market intelligence unavailable" };
  }

  // ---- WAVE 3: strategy requires inventory at minimum ------------------
  if (!inventory) {
    await recRepo.markFailed(recommendation.id, "Inventory agent failed — cannot price without a cost floor");
    yield { type: "recommendation_failed", failedAgent: "INVENTORY_COST",
            error: "Cannot produce a recommendation without cost constraints" };
    return;
  }

  yield { type: "agent_started", agent: "PRICING_STRATEGY" };
  const strategyResult = await runAndPersist("PRICING_STRATEGY", recommendation.id, () =>
    runAgent({ ...strategyConfig(product, market, demand, inventory, org), ctx }));

  const strategy = unwrap(strategyResult, "PRICING_STRATEGY", failed);
  if (!strategy) {
    await recRepo.markFailed(recommendation.id, "Strategy agent failed");
    yield { type: "recommendation_failed", failedAgent: "PRICING_STRATEGY", error: "Synthesis failed" };
    return;
  }
  yield emitResult("PRICING_STRATEGY", strategyResult);

  // ---- confidence, computed in code ------------------------------------
  const deltaPct = (strategy.recommendedPrice - Number(product.currentPrice)) / Number(product.currentPrice);
  const confidence = computeConfidence({ market, demand, inventory, strategy, priceDeltaPct: deltaPct, failedAgents: failed });

  // ---- WAVE 4: compliance ---------------------------------------------
  yield { type: "agent_started", agent: "EXECUTION_COMPLIANCE" };
  const violations = checkBusinessRules(product, strategy.recommendedPrice, org, categoryRule);
  const complianceResult = await runAndPersist("EXECUTION_COMPLIANCE", recommendation.id, () =>
    runAgent({ ...complianceConfig(product, strategy, violations, org), ctx }));
  const compliance = unwrap(complianceResult, "EXECUTION_COMPLIANCE", failed);
  yield emitResult("EXECUTION_COMPLIANCE", complianceResult);

  if (!compliance || compliance.decision === "block") {
    await recRepo.finalize(recommendation.id, {
      recommendedPrice: strategy.recommendedPrice,
      confidenceScore: confidence.final,
      rationale: strategy.rationale,
      factorWeights: { ...strategy.factorWeights, confidenceBreakdown: confidence },
      status: "PENDING",          // blocked recommendations still go to a human
    });
    yield { type: "recommendation_ready", autoExecuted: false, blocked: true,
            recommendation: await recRepo.findById(orgId, recommendation.id) };
    return;
  }

  const finalPrice = compliance.finalPrice;
  const shouldAutoExecute = confidence.final >= org.confidenceThreshold;

  await recRepo.finalize(recommendation.id, {
    recommendedPrice: finalPrice,
    confidenceScore: confidence.final,
    rationale: strategy.rationale,
    factorWeights: { ...strategy.factorWeights, confidenceBreakdown: confidence },
    status: shouldAutoExecute ? "AUTO_EXECUTED" : "PENDING",
  });

  if (shouldAutoExecute) {
    try {
      await executeRecommendation(orgId, recommendation.id, finalPrice, null);
    } catch {
      // Execution failure after auto-approval falls back to the human queue
      // rather than losing the recommendation.
      await recRepo.setStatus(recommendation.id, "PENDING");
      yield { type: "recommendation_ready", autoExecuted: false, executionFailed: true,
              recommendation: await recRepo.findById(orgId, recommendation.id) };
      return;
    }
  }

  yield { type: "recommendation_ready", autoExecuted: shouldAutoExecute,
          recommendation: await recRepo.findById(orgId, recommendation.id) };
}
```

**Why an async generator:** the orchestrator yields events and knows nothing
about HTTP. The SSE route consumes the generator and writes frames. A future
worker could consume the same generator and write to a queue instead. The
business logic is not coupled to the transport.

### Acceptance criteria
- Happy path emits exactly 11 events (5 started, 5 completed, 1 ready).
- Market agent failure → demand skipped, pipeline continues, two penalties applied.
- Inventory agent failure → pipeline aborts with `recommendation_failed`.
- Confidence above threshold → `AUTO_EXECUTED` and the product price changes.
- Confidence below threshold → `PENDING` and the price is unchanged.
- Exactly 5 `AgentRun` rows per run (4 if one was skipped).

### Commit
```
feat(agents): add pipeline orchestrator with graceful degradation and auto-execution
```

---

## 3.10 — SSE streaming endpoint

### Objective
Stream the orchestrator's events to the browser.

### Files touched
```
apps/backend/src/routes/stream.routes.ts
apps/backend/src/controllers/stream.controller.ts
```

### Implementation

```ts
export async function generateRecommendation(req: Request, res: Response) {
  const { orgId, userId } = requireCtx(req);
  const { productId } = req.validated!.params as { productId: string };

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",        // stops proxies buffering the stream
  });

  // Comment frame every 15s so intermediaries do not close an idle connection.
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);

  // The client disconnecting must NOT abort the pipeline — the recommendation
  // is still valuable and will be picked up on the next query refetch.
  let clientGone = false;
  req.on("close", () => { clientGone = true; clearInterval(keepAlive); });

  const send = (event: PipelineEvent) => {
    if (clientGone) return;
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    for await (const event of orchestrate(orgId, productId, req.requestId)) {
      send(event);
    }
  } catch (err) {
    send({ type: "recommendation_failed",
           error: err instanceof AppError ? err.message : "Pipeline failed" });
    logger.error({ requestId: req.requestId, err }, "pipeline error");
  } finally {
    clearInterval(keepAlive);
    if (!clientGone) res.end();
  }
}
```

Three details that matter and are each worth a sentence in the interview:
`X-Accel-Buffering: no` because Render sits behind a proxy that would otherwise
buffer the whole response; the keep-alive comment frame because idle connections
get culled; and continuing after client disconnect because a recommendation that
took 15 seconds and five LLM calls should not be discarded because someone
closed a tab.

### Acceptance criteria
- `curl -N` shows events arriving progressively, not all at once at the end.
- Killing the client mid-stream still results in a persisted recommendation.
- An org that does not own the product gets 404 before the stream opens.

### Commit
```
feat(api): add sse endpoint streaming agent pipeline progress
```

---

## 3.11 — Agent unit tests

### Objective
Full coverage of agent behaviour with zero network calls.

### Files touched
```
apps/backend/tests/unit/agents/*.test.ts
apps/backend/tests/helpers/mockGroq.ts
```

### Implementation

A mock Groq builder that returns scripted responses:

```ts
export function mockGroqSequence(responses: MockResponse[]) {
  let i = 0;
  return {
    chat: { completions: { create: async () => {
      const r = responses[i++];
      if (!r) throw new Error("mockGroq: ran out of scripted responses");
      if (r.kind === "error") throw r.error;
      return buildCompletion(r);
    } } },
  };
}
```

Test matrix per agent:

| Case | Expectation |
|---|---|
| Clean JSON response | Parsed, typed output |
| JSON wrapped in a markdown fence | Fence stripped, parsed |
| Prose before the JSON | Object extracted |
| Schema-invalid output | One repair retry, then success |
| Schema-invalid twice | Agent fails, orchestrator handles |
| Model requests one tool | Tool executed, loop continues, second response returned |
| Model requests two tools | Both run concurrently |
| Tool throws | Error returned to model as data, no crash |
| 429 then success | One retry, correct result |
| Persistent 429 | `LLM_UNAVAILABLE` after max retries |
| Timeout | `AGENT_TIMEOUT` |
| Tool round limit exceeded | `AGENT_TIMEOUT` |

Plus pure-function tests for `computeConfidence` (8 cases) and
`checkBusinessRules` (7 cases), which need no mocking at all.

### Acceptance criteria
- `bun test` completes in under 10 seconds.
- No test makes a network request (assert by failing the suite if
  `GROQ_API_KEY` is read).
- Every branch in `confidence.ts` and `executionCompliance.ts` covered.

### Commit
```
test(agents): cover tool loop, schema repair, retries and confidence maths
```

---

## 3.12 — Live agent feed UI

### Objective
The screen that makes the multi-agent architecture visible — and the single best
thing to show in the live demo.

### Files touched
```
apps/frontend/src/hooks/useAgentStream.ts
apps/frontend/src/components/agents/AgentPipeline.tsx
apps/frontend/src/components/agents/AgentCard.tsx
```

### Implementation

**3.12.1** The SSE hook. `EventSource` cannot issue a POST or set headers, so use
`fetch` with a streaming reader:

```ts
export function useAgentStream() {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [status, setStatus] = useState<"idle"|"running"|"done"|"error">("idle");
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (productId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setEvents([]); setStatus("running");

    const res = await fetch(`${BASE}/products/${productId}/generate-recommendation`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Pricewise-Client": "web" },
      signal: controller.signal,
    });

    if (!res.body) { setStatus("error"); return; }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE frames are separated by a blank line. Anything after the last
      // blank line is an incomplete frame — keep it in the buffer.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;                    // keep-alive comment frame
        const event = JSON.parse(dataLine.slice(6)) as PipelineEvent;
        setEvents((prev) => [...prev, event]);
        if (event.type === "recommendation_ready")  setStatus("done");
        if (event.type === "recommendation_failed") setStatus("error");
      }
    }
  }, []);

  return { events, status, start, cancel: () => abortRef.current?.abort() };
}
```

The partial-frame buffering is the part people get wrong: a chunk boundary can
land in the middle of a JSON payload, and naively parsing each chunk throws.

**3.12.2** The visual. Five agent cards in pipeline order, each moving through
pending → running → done, with:

- a pulsing indicator and elapsed timer while running
- the two Wave-1 agents visually grouped to show they run concurrently
- on completion, a collapsed summary of that agent's key output
  ("Competitor median $289.99, trend falling") expandable to the full JSON
- a skipped agent rendered greyed with its reason
- a failed agent rendered with its error and a retry affordance

Then a final panel: the recommended price with a before/after arrow, the
confidence waterfall (base score, each penalty as a labelled deduction, final),
and either "Auto-executed" or "Sent for your approval".

### Acceptance criteria
- Agents visibly progress one at a time; the two Wave-1 agents start together.
- Chunk boundaries never produce a parse error (test by throttling the network).
- Navigating away mid-stream and returning shows the completed recommendation.
- Reduced-motion preference disables the pulse animation.

### Commit
```
feat(web): add live agent pipeline view consuming the sse stream
```

### Interview note
*"Why stream rather than just showing a spinner?"* — Two reasons, one technical
and one product. Technically, a full pipeline takes eight to twenty seconds
across five model calls; that is well past the point where an undifferentiated
spinner feels broken. From a product standpoint, the pipeline *is* the value
proposition — a human is being asked to trust a price recommendation, and
watching the specialist agents report in sequence is what makes the output feel
accountable rather than oracular. The explainability is not a separate feature
bolted on; it is the loading state.

---
# Phase 4 — Approval workflow, audit trail, admin console

**Goal:** the human half of human-in-the-loop. The AI produces; a person decides;
the system remembers who decided what.

**Duration estimate:** 8 hours

---

## 4.1 — Recommendation list and detail

### Objective
Cursor-paginated queue and a detail view exposing the full agent trail.

### Files touched
```
apps/backend/src/services/recommendation.service.ts
apps/backend/src/repositories/recommendation.repository.ts
apps/backend/src/controllers/recommendation.controller.ts
apps/backend/src/routes/recommendation.routes.ts
```

### Implementation

**4.1.1** Cursor pagination. Offset pagination breaks on a feed that grows while
you read it — page 2 re-shows rows that shifted down. Cursor pagination is stable.

```ts
export async function listRecommendations(orgId: string, q: RecommendationQuery) {
  const rows = await prisma.pricingRecommendation.findMany({
    where: {
      organizationId: orgId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.minConfidence ? { confidenceScore: { gte: q.minConfidence } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],   // id breaks ties deterministically
    take: q.limit + 1,                                   // one extra reveals hasMore
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: {
      product: { select: { id: true, sku: true, name: true, category: true, currentPrice: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });

  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;

  return { items, nextCursor: hasMore ? items.at(-1)!.id : null, hasMore };
}
```

The composite `orderBy` matters: two recommendations created in the same
millisecond would otherwise order non-deterministically and the cursor could skip
or repeat a row.

**4.1.2** Detail view assembles everything the explainability UI needs in one
round trip:

```ts
export async function getRecommendationDetail(orgId: string, id: string) {
  const rec = await prisma.pricingRecommendation.findFirst({
    where: { id, organizationId: orgId },          // tenant scope in the same predicate
    include: {
      product: true,
      resolvedBy: { select: { id: true, name: true, email: true } },
      agentRuns: { orderBy: { createdAt: "asc" } },
      executions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!rec) throw notFound("Recommendation");

  // Comparable historical decisions — the assessment asks for this explicitly
  // in the detail view ("comparable historical decisions").
  const comparable = await prisma.pricingRecommendation.findMany({
    where: {
      organizationId: orgId,
      productId: rec.productId,
      id: { not: rec.id },
      status: { in: ["APPROVED", "REJECTED", "MODIFIED", "AUTO_EXECUTED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, recommendedPrice: true, modifiedPrice: true, confidenceScore: true,
              status: true, rejectionReason: true, createdAt: true },
  });

  return { ...rec, comparable };
}
```

### Acceptance criteria
- Cursor paging through 30 recommendations returns each exactly once.
- Org B requesting Org A's recommendation id → 404.
- Detail returns all 5 agent runs in execution order.
- `comparable` excludes the current recommendation and PENDING ones.

### Commit
```
feat(recommendations): add cursor-paginated queue and detail view with agent trail
```

---

## 4.2 — Approve, reject, modify

### Objective
The three human actions, each audited, each with correct state transitions.

### Files touched
```
apps/backend/src/services/recommendation.service.ts
```

### Implementation

**4.2.1** A state machine, declared rather than implied:

```ts
const ALLOWED_TRANSITIONS: Record<RecStatus, RecStatus[]> = {
  PENDING:       ["APPROVED", "REJECTED", "MODIFIED", "FAILED"],
  APPROVED:      [],
  REJECTED:      [],
  MODIFIED:      [],
  AUTO_EXECUTED: [],
  FAILED:        [],
};

function assertTransition(from: RecStatus, to: RecStatus) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppError("CONFLICT", `Cannot move a ${from} recommendation to ${to}`);
  }
}
```

Terminal states are genuinely terminal. Re-approving an approved recommendation
would double-execute a price change; the state machine makes that impossible
rather than relying on the UI hiding the button.

**4.2.2** Approve:

```ts
export async function approve(orgId: string, actorId: string, id: string) {
  const rec = await recRepo.findById(orgId, id);
  if (!rec) throw notFound("Recommendation");
  assertTransition(rec.status, "APPROVED");

  // Executes, with its own rollback handling (Phase 3.7).
  await executeRecommendation(orgId, id, Number(rec.recommendedPrice), actorId);

  const updated = await recRepo.update(orgId, id, {
    status: "APPROVED", resolvedByUserId: actorId, resolvedAt: new Date(),
  });

  await auditService.record({
    orgId, userId: actorId, action: "RECOMMENDATION_APPROVED",
    entityType: "PricingRecommendation", entityId: id,
    beforeValue: { status: rec.status },
    afterValue: { status: "APPROVED", executedPrice: Number(rec.recommendedPrice) },
  });

  return updated;
}
```

**4.2.3** Reject — the reason is not cosmetic. It is stored, surfaced in the
`comparable` list on future recommendations for the same product, and is the
feedback loop the assessment's example workflow describes ("rejects 2 with a
reason that feeds back into the system").

```ts
export async function reject(orgId: string, actorId: string, id: string, reason: string) {
  const rec = await recRepo.findById(orgId, id);
  if (!rec) throw notFound("Recommendation");
  assertTransition(rec.status, "REJECTED");
  // No execution. The product price is untouched.
  ...
}
```

**4.2.4** Modify — the analyst overrides the AI's price. Their price is still
subject to the rule engine; a human may not sell below cost either.

```ts
export async function modify(orgId: string, actorId: string, id: string, newPrice: number) {
  const rec = await recRepo.findById(orgId, id);
  if (!rec) throw notFound("Recommendation");
  assertTransition(rec.status, "MODIFIED");

  const product = await productRepo.findById(orgId, rec.productId);
  const violations = checkBusinessRules(product!, newPrice, org, categoryRule)
    .filter((v) => v.severity === "block");

  if (violations.length) {
    throw new AppError("VALIDATION_ERROR", "That price violates a business rule", { violations });
  }

  await executeRecommendation(orgId, id, newPrice, actorId);

  const updated = await recRepo.update(orgId, id, {
    status: "MODIFIED", modifiedPrice: newPrice,
    resolvedByUserId: actorId, resolvedAt: new Date(),
  });

  await auditService.record({
    orgId, userId: actorId, action: "RECOMMENDATION_MODIFIED",
    entityType: "PricingRecommendation", entityId: id,
    beforeValue: { aiRecommendedPrice: Number(rec.recommendedPrice), confidence: rec.confidenceScore },
    afterValue:  { humanChosenPrice: newPrice },
  });

  return updated;
}
```

The audit record for a modification deliberately stores both what the AI said and
what the human chose. That pair is the raw material for ever answering "is our
model any good?" — a point worth raising in the interview as future work.

### Acceptance criteria
- Approving a PENDING recommendation changes the product price and writes an audit row.
- Approving twice → second attempt 409 `CONFLICT`.
- Rejecting leaves the product price unchanged.
- Modifying below the margin floor → 422 with the violation detail.
- Every action records `resolvedByUserId` and `resolvedAt`.

### Commit
```
feat(recommendations): add approve, reject and modify with state machine and audit
```

---

## 4.3 — Audit trail

### Objective
A queryable, immutable history.

### Files touched
```
apps/backend/src/services/audit.service.ts
apps/backend/src/routes/audit.routes.ts
```

### Implementation

```ts
export async function record(entry: AuditEntry, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  // Audit writes must never break the operation they describe. A failure here
  // is logged loudly but does not roll back a successful price change.
  try {
    await client.auditLog.create({ data: { ...entry } });
  } catch (err) {
    logger.error({ err, entry }, "AUDIT WRITE FAILED");
  }
}
```

There is no update or delete function in this service, and no route exposes one.
Immutability is enforced by absence.

Filters: `entityType`, `entityId`, `userId`, `action`, `from`/`to` dates, cursor
pagination on `[organizationId, createdAt]` which is exactly the existing index.

### Acceptance criteria
- Every state-changing operation in the app produces exactly one audit row.
- No route can modify or delete an audit row.
- Org B cannot read Org A's audit log.
- Date filtering is inclusive at both bounds.

### Commit
```
feat(audit): add immutable audit trail with filtering and cursor pagination
```

---

## 4.4 — Approval queue UI

### Objective
The analyst's working screen.

### Files touched
```
apps/frontend/src/pages/RecommendationsPage.tsx
apps/frontend/src/components/recommendations/RecommendationQueue.tsx
apps/frontend/src/components/recommendations/ConfidenceBadge.tsx
apps/frontend/src/components/recommendations/QuickActions.tsx
```

### Implementation

Queue row: product name and SKU, current price → recommended price with a
direction arrow and percentage delta, a confidence badge (colour-banded: ≥0.85
green, 0.70–0.85 amber, <0.70 red), a one-line rationale excerpt, age, and
approve / reject / view actions.

Sorted by confidence descending by default — the assessment's own example
workflow describes an analyst seeing "12 pending recommendations sorted by
confidence score", so match that.

**Optimistic updates** for approve, because the analyst is processing a queue and
a 400ms round trip per row makes the screen feel slow:

```ts
const approveMutation = useMutation({
  mutationFn: (id: string) => api.post(`/recommendations/${id}/approve`),
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ["recommendations"] });
    const previous = queryClient.getQueryData(["recommendations", filters]);
    queryClient.setQueryData(["recommendations", filters], (old) => removeById(old, id));
    return { previous };
  },
  onError: (err, _id, context) => {
    queryClient.setQueryData(["recommendations", filters], context?.previous);
    toast.error(err.message);                     // row comes back, reason shown
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
});
```

Bulk approve: a checkbox column plus "Approve selected", issued as sequential
requests with a progress toast, matching the workflow in the brief ("approves 8
with one click").

Reject opens a dialog requiring a reason with a minimum length — an empty reason
is worthless to the feedback loop, so the UI refuses it before the API does.

### Acceptance criteria
- Approving removes the row immediately; a server error restores it with a toast.
- Bulk approving 8 rows shows progress and a final summary.
- Reject cannot be submitted with a blank reason.
- Empty queue shows a useful empty state, not a bare table header.

### Commit
```
feat(web): add approval queue with optimistic updates and bulk actions
```

---

## 4.5 — Recommendation detail and explainability

### Objective
The screen that justifies the whole product: why did the AI say this?

### Files touched
```
apps/frontend/src/pages/RecommendationDetailPage.tsx
apps/frontend/src/components/recommendations/AgentContributionCard.tsx
apps/frontend/src/components/recommendations/ConfidenceWaterfall.tsx
apps/frontend/src/components/recommendations/FactorWeightChart.tsx
apps/frontend/src/components/recommendations/ComparableDecisions.tsx
```

### Implementation

Layout, top to bottom:

1. **Header** — product, current → recommended price, delta, status badge,
   action buttons (hidden when terminal).
2. **Rationale** — the strategy agent's prose, rendered prominently. This is what
   a human actually reads first.
3. **Factor weights** — a horizontal bar or small radial chart (Recharts) showing
   competitor pressure / demand / inventory / margin protection. Immediately
   answers "what drove this?"
4. **Confidence waterfall** — base score, then each penalty as a labelled red
   deduction, then the final score with the org threshold drawn as a reference
   line. This is the explainability bonus, and it is genuinely informative: an
   analyst sees *"0.88 base, −0.15 stale competitor data, = 0.73, below your 0.85
   threshold, so it came to you."*
5. **Agent-by-agent trail** — five expandable cards, each showing that agent's
   headline finding, its self-reported confidence, which tools it called with
   what arguments, duration, token usage, and the raw JSON on expand.
6. **Comparable decisions** — past outcomes for this product, including any
   rejection reasons. Context for the current call.
7. **Execution history** — every attempt, success or rollback, with timestamps.

### Acceptance criteria
- Every number on the page traces to a stored field; nothing is recomputed
  client-side in a way that could disagree with the backend.
- Waterfall deductions sum correctly to the final score.
- A FAILED recommendation shows which agent failed and why.
- Terminal recommendations show who resolved them and when, with no action buttons.

### Commit
```
feat(web): add recommendation detail with agent trail and confidence explainability
```

### Interview note
*"What makes this more than a chatbot wrapper?"* — This page. A wrapper produces
text that a user either trusts or does not. Here, every recommendation carries a
structured provenance: which specialist agent contributed what, which tools were
called with which arguments, how the confidence was assembled from named
components, and what happened last time we touched this product's price. The
human is not being asked to trust the model; they are being given the model's
working.

---

## 4.6 — Admin configuration console

### Objective
The admin-only surface that proves RBAC visibly.

### Files touched
```
apps/frontend/src/pages/SettingsPage.tsx
apps/frontend/src/components/admin/ThresholdSlider.tsx
apps/frontend/src/components/admin/CategoryRulesTable.tsx
apps/frontend/src/components/admin/InviteManager.tsx
```

### Implementation

- **Confidence threshold** — a slider from 0.50 to 1.00 with live preview text:
  *"Of your last 20 recommendations, 14 would have auto-executed at this
  threshold."* Computed from existing data; makes an abstract number concrete.
- **Category rules** — per-category margin floor and max delta, inline editable.
- **Invites** — issue a code, see outstanding invites, revoke one. The generated
  code is shown with a copy button.
- **Members** — list users with roles; changing a role writes an audit row.

### Acceptance criteria
- ANALYST navigating to `/settings` sees the forbidden page.
- Threshold change persists and immediately affects the next generation run.
- The preview count recomputes as the slider moves, without a request per pixel
  (debounced, or computed client-side from already-fetched data).

### Commit
```
feat(web): add admin settings with threshold, category rules and invite management
```

---

## 4.7 — Dashboard home

### Objective
The landing screen — the first thing an evaluator sees after login.

### Files touched
```
apps/frontend/src/pages/DashboardPage.tsx
apps/frontend/src/components/dashboard/*
```

### Implementation

- Four stat cards: pending recommendations, auto-executed this week, average
  confidence, estimated margin impact of approved changes.
- A price-change chart over the last 30 days (Recharts).
- Recent activity feed from the audit log.
- Quick actions: Generate for a watched SKU, Review queue, Simulate market event.
- The organization name prominently in the header — this is what makes the
  two-tenant demo legible when you switch accounts on screen.

### Acceptance criteria
- Loads in one request per widget, no waterfalls.
- Every widget has its own loading skeleton and empty state.
- Numbers reconcile with the underlying pages.

### Commit
```
feat(web): add dashboard home with stats, activity feed and quick actions
```

---

# Phase 5 — Testing, CI/CD, deployment

**Duration estimate:** 6 hours

---

## 5.1 — Integration test harness

### Files touched
```
apps/backend/tests/helpers/testDb.ts
apps/backend/tests/helpers/factories.ts
apps/backend/tests/integration/*.test.ts
```

### Implementation

Each test file runs against a real Postgres (the same container, a separate
database), migrated once, truncated between tests:

```ts
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}
```

Factories that produce a fully-formed tenant in one call:

```ts
export async function createTestOrg(overrides?: Partial<OrgOptions>) {
  // returns { org, admin, analyst, products, adminCookies, analystCookies }
}
```

Every isolation test then reads:

```ts
const a = await createTestOrg({ name: "Org A" });
const b = await createTestOrg({ name: "Org B" });

const res = await request(app)
  .get(`/products/${a.products[0].id}`)
  .set("Cookie", b.analystCookies);

expect(res.status).toBe(404);
```

### The isolation matrix — every row is a test

| Resource | Read | List | Create | Update | Delete |
|---|---|---|---|---|---|
| Product | 404 | absent from results | n/a | 404 | 404 |
| Recommendation | 404 | absent | n/a | 404 | n/a |
| AuditLog | n/a | absent | n/a | n/a | n/a |
| Invite | 404 | absent | n/a | n/a | 404 |
| Org settings | own only | n/a | n/a | own only | n/a |

### Acceptance criteria
- Tests run in isolation and in any order.
- The full integration suite completes in under 60 seconds.
- Every cell in the matrix above has a passing test.

### Commit
```
test(api): add integration harness with tenant isolation matrix
```

---

## 5.2 — Playwright end-to-end

### Files touched
```
apps/frontend/playwright.config.ts
apps/frontend/e2e/auth.spec.ts
apps/frontend/e2e/pipeline.spec.ts
apps/frontend/e2e/tenancy.spec.ts
apps/frontend/e2e/rbac.spec.ts
```

### Implementation

Three journeys, matching exactly what the assessment asks you to demo live:

**5.2.1 The core AI feature**

```ts
test("generates a recommendation and approves it", async ({ page }) => {
  await loginAs(page, "analyst@northwind.test");
  await page.goto("/products");
  await page.getByRole("row", { name: /NW-ELEC-0007/ }).getByRole("button", { name: "Generate" }).click();

  // All five agents appear and complete.
  for (const agent of AGENTS) {
    await expect(page.getByTestId(`agent-${agent}`)).toHaveAttribute("data-status", "done", { timeout: 45_000 });
  }

  await expect(page.getByTestId("recommended-price")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/approved/i)).toBeVisible();
});
```

**5.2.2 Multi-tenant isolation** — two browser contexts side by side:

```ts
test("organizations cannot see each other's data", async ({ browser }) => {
  const northwind = await browser.newContext();
  const meridian  = await browser.newContext();

  const p1 = await northwind.newPage();
  const p2 = await meridian.newPage();

  await loginAs(p1, "analyst@northwind.test");
  await loginAs(p2, "analyst@meridian.test");

  await p1.goto("/products");
  const northwindSkus = await p1.getByTestId("product-sku").allInnerTexts();

  await p2.goto("/products");
  const meridianSkus = await p2.getByTestId("product-sku").allInnerTexts();

  expect(intersection(northwindSkus, meridianSkus)).toHaveLength(0);

  // Direct URL access to the other tenant's resource.
  const id = await getFirstProductId(p1);
  await p2.goto(`/products/${id}`);
  await expect(p2.getByText(/not found/i)).toBeVisible();
});
```

**5.2.3 RBAC** — analyst and admin in parallel contexts, asserting both the
hidden UI and the blocked direct navigation.

Set `MOCK_PLATFORM_FAILURE_RATE=0` for E2E so execution is deterministic, and
seed a fixed dataset before the run.

### Acceptance criteria
- All three specs pass headless locally and in CI.
- The pipeline spec tolerates real LLM latency (45s timeout) without flaking.
- A trace is captured on failure for debugging.

### Commit
```
test(e2e): add playwright specs for pipeline, tenancy and rbac journeys
```

---

## 5.3 — Full CI pipeline

### Files touched
```
.github/workflows/ci.yml
```

### Implementation

```yaml
jobs:
  quality:
    # typecheck + lint (from Phase 0)

  test:
    needs: quality
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: pricewise
          POSTGRES_PASSWORD: pricewise
          POSTGRES_DB: pricewise_test
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
        ports: ["5432:5432"]
    env:
      DATABASE_URL: postgresql://pricewise:pricewise@localhost:5432/pricewise_test
      JWT_ACCESS_SECRET:  ${{ secrets.TEST_JWT_ACCESS_SECRET }}
      JWT_REFRESH_SECRET: ${{ secrets.TEST_JWT_REFRESH_SECRET }}
      GROQ_API_KEY: test-key-not-used-unit-tests-mock-groq
      CORS_ORIGIN: http://localhost:5173
      GROQ_MODEL_FAST: test-model
      GROQ_MODEL_STRONG: test-model
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run --cwd apps/backend db:generate
      - run: bun run --cwd apps/backend db:deploy
      - run: bun run --cwd apps/backend test
      - run: bun run --cwd apps/frontend test

  build:
    needs: test
    steps:
      - run: bun run build
      - uses: actions/upload-artifact@v4
        with: { name: frontend-dist, path: apps/frontend/dist }

  e2e:
    needs: build
    # postgres service + seeded data + playwright, uploads report on failure
```

### Acceptance criteria
- A pull request shows four job statuses.
- A failing test blocks the merge.
- Playwright report uploads as an artifact on failure.

### Commit
```
chore(ci): add test, build and e2e jobs with postgres service container
```

---

## 5.4 — Deployment

### Files touched
```
render.yaml
apps/frontend/vercel.json
apps/backend/src/routes/health.routes.ts
```

### Implementation

**5.4.1** Health endpoint — Render needs it, and it is the fastest way to
diagnose a bad deploy:

```ts
router.get("/healthz", async (_req, res) => {
  const checks = { database: false, groq: false };
  try { await prisma.$queryRaw`SELECT 1`; checks.database = true; } catch {}
  checks.groq = Boolean(env.GROQ_API_KEY);

  const healthy = checks.database;         // Groq being down is degraded, not dead
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks,
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "local",
    uptime: process.uptime(),
  });
});
```

**5.4.2** `render.yaml`:

```yaml
services:
  - type: web
    name: pricewise-api
    runtime: node
    buildCommand: bun install && bun run --cwd apps/backend db:generate && bun run --cwd apps/backend build
    startCommand: bun run --cwd apps/backend db:deploy && bun run --cwd apps/backend start
    healthCheckPath: /healthz
    envVars:
      - key: NODE_ENV
        value: production
      - key: COOKIE_SECURE
        value: true
      - key: DATABASE_URL
        sync: false
      - key: GROQ_API_KEY
        sync: false
      # ... remaining secrets marked sync:false so they are set in the dashboard
```

Running `db:deploy` in the start command means a migration ships with the code
that needs it — no manual step to forget on demo day.

**5.4.3** Cross-site cookie configuration. This is the single most likely thing
to break in production and is worth understanding before it does: the API on
`*.onrender.com` and the frontend on `*.vercel.app` are **different sites**, so
`SameSite=Lax` will not send the auth cookie on cross-site requests.

Two options, both documented in DECISIONS.md:
- `SameSite=None; Secure` — works immediately, requires HTTPS (both platforms
  provide it), and requires the CSRF custom-header guard to be genuinely enforced
  because SameSite is no longer providing protection.
- A custom domain with the API on `api.yourdomain.com` and the app on
  `app.yourdomain.com` — same site, `SameSite=Lax` works, strictly better.

Choose `SameSite=None; Secure` for the submission (no domain purchase required),
and state in DECISIONS.md that the custom-domain approach is what you would ship.

### Acceptance criteria
- `/healthz` returns 200 with `database: true` on the deployed API.
- Login works on the deployed frontend and the cookie persists across reloads.
- The SSE stream works through Render's proxy (this is what
  `X-Accel-Buffering: no` is for — verify explicitly, it is easy to miss).
- A push to `main` auto-deploys both services.

### Commit
```
chore(deploy): add render and vercel configuration with health checks
```

---

# Phase 6 — Documentation, screenshots, presentation

**Duration estimate:** 5 hours

---

## 6.1 — README.md

Required sections, in this order:

1. **One-paragraph pitch** and a screenshot of the agent pipeline mid-run — the
   most visually distinctive thing you built, above the fold.
2. **Which option and why** — Option B, and the honest reasoning: multi-agent
   orchestration is the more interesting engineering problem, and synthetic data
   sources meant zero external-API flakiness risk for a live deployment.
3. **Live demo** — URL plus the four seeded logins in a table. The evaluator
   should be one click from a populated dashboard.
4. **Tech stack table** with a one-line rationale per choice.
5. **Setup** — the five commands, tested from a fresh clone:
   ```bash
   git clone <url> && cd pricewise
   cp apps/backend/.env.example apps/backend/.env    # add your GROQ_API_KEY
   bun install
   bun run db:up && bun run db:migrate && bun run db:seed
   bun run dev
   ```
6. **Screenshots** — six minimum: login, dashboard, catalog, live agent pipeline,
   recommendation detail with the confidence waterfall, admin settings, audit
   trail.
7. **The five planted demo scenarios**, with what each one demonstrates. This
   directly tells the evaluator what to click to see the interesting behaviour.
8. **Architecture summary** with a link to ARCHITECTURE.md.
9. **Testing** — how to run each suite, what is covered.
10. **Known limitations** — written honestly. This section earns more credit than
    it costs. See 6.3.

### Acceptance criteria
- Clone into a fresh directory, follow your own README exactly, app runs. The
  assessment explicitly says they will do this.

---

## 6.2 — ARCHITECTURE.md

Six diagrams, all already produced in the HLD file — export each as PNG and embed
with explanatory prose:

1. System architecture
2. Data flow (one recommendation, end to end)
3. ER diagram
4. AI orchestration / multi-agent flow
5. Multi-tenant data flow, including the attack trace
6. Deployment topology

Plus the API design table, generated from `openapi.yaml`, and a section on the
agent design rationale (the four principles from Phase 3.0).

---

## 6.3 — DECISIONS.md

The seven required questions, answered with genuine specificity:

**Which option and why** — Option B. Multi-agent orchestration over a single
tool-calling loop; synthetic data removed external-API flakiness as a risk to a
live demo; the human-in-the-loop approval queue gave a real product surface
rather than a search box.

**Tech stack and alternatives** — Bun for speed and native TypeScript; Express
over Hono/Fastify because middleware ordering is explicit and legible, which
matters when middleware *is* the security model. Prisma over Drizzle for the
schema-first workflow and migration tooling. Groq over OpenAI/Anthropic because a
five-agent pipeline is latency-bound and Groq's inference speed directly
determines whether the streaming UI feels alive. Custom JWT over Supabase Auth
because I wanted to own — and be able to explain — token rotation and theft
detection.

**Multi-tenancy approach** — shared database, shared schema, `organizationId`
column, enforced at four layers (JWT-only source of truth, required positional
service parameter, integration test matrix, Postgres RLS on the three
highest-risk tables). Rejected schema-per-tenant: migration complexity across N
schemas is not worth it at this scale, and the security property is achievable
without it.

**AI integration and prompt engineering** — the four principles from Phase 3.0,
with concrete examples: floor price computed in code and passed into the prompt;
upstream confidence passed downstream so a shaky input produces a hedged output;
elasticity anchors per category because unguided models return wildly
inconsistent magnitudes; tools returning `available: false` rather than throwing
so the model can reason about missing data.

**Trade-offs given five days** — RLS on three tables rather than all eleven;
invite codes instead of transactional email; a mock competitor scraper rather
than a real one; no background job queue, so generation is synchronous and
request-scoped; bulk approve issues sequential requests rather than a batch
endpoint.

**What two more weeks would buy** — a job queue (BullMQ) so recommendations can
be generated on a schedule across the catalog rather than one at a time; a
feedback loop training on the stored AI-vs-human price pairs already being
captured on every modification; per-agent prompt versioning with A/B evaluation;
a real competitor scraper; WebSocket fan-out so a team sees the queue update
live; per-org LLM cost tracking and budget caps.

**The hardest part** — the honest answer is agent hand-off reliability. The first
version had agents passing prose and the strategy agent routinely
misinterpreting it. The fix was three-part: strict Zod schemas on every hand-off,
one schema-repair retry that shows the model its own validation error, and moving
all arithmetic out of the prompts into TypeScript. What made it tractable was
persisting every `AgentRun` from the start, so failures could be read after the
fact instead of reproduced.

---

## 6.4 — Presentation deck

15-minute walkthrough. Roughly 14 slides:

1. Title
2. The problem — manual weekly repricing, 8–12% revenue leakage, 6 analysts
   spending 70% of their time gathering data
3. The insight — the bottleneck is not pricing decisions, it is the data
   gathering that precedes them
4. Solution overview — one screenshot of the live pipeline
5. What it does — the Sony-headphones worked example from the brief, end to end
6. Live demo pointer (you switch to the app here)
7. Architecture — the system diagram
8. The multi-agent design — why five agents rather than one prompt
9. Trust and explainability — the confidence waterfall screenshot; this is the
   slide that answers "why would a business let AI change prices?"
10. Multi-tenancy and security — four-layer isolation
11. Engineering quality — tests, CI, coverage numbers
12. Cost — free tier throughout; ~6–9k tokens per full pipeline run; what it
    would cost at 500 SKUs repriced daily. The HR email lists cost as one of
    three evaluation parameters, so give it a real slide with real arithmetic.
13. Business impact — time saved per SKU, response latency to competitor moves
    measured in minutes rather than a week
14. What I would build next

---

# Appendix A — Day-by-day schedule

| Day | Phases | Target state at end of day |
|---|---|---|
| **1** | 0, 1.1–1.4 | Repo, CI, schema migrated, auth service with rotation, unit tests green |
| **2** | 1.5–1.7, 2.1–2.4 | Full middleware, auth routes, org/invites, product CRUD, seed data, integration tests |
| **3** | 2.5–2.8, 3.1–3.2 | Frontend shell, auth pages, catalog UI, Groq client with tool loop, tools built |
| **4** | 3.3–3.12 | All five agents, orchestrator, SSE, live agent UI. **The demo works end to end.** |
| **5** | 4, 5, 6 | Approval workflow, detail view, admin console, E2E, deploy, all docs |

Build a checkpoint into the end of Day 4: if the pipeline does not work
end-to-end by then, cut scope from Phase 4 (bulk approve, comparable decisions,
dashboard charts) rather than from documentation or deployment. A working app
with fewer features beats a broken app with more — the assessment says this
explicitly.

---

# Appendix B — Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Groq rate limits during development | High | Medium | Cache agent responses in dev by input hash; seed pre-computed AgentRuns so the detail UI can be built without live calls |
| Model returns unparseable output | High | Medium | Fence stripping, brace extraction, one schema-repair retry — all built in 3.1.3 |
| Cross-site cookies fail in production | Medium | High | Test the deployed auth flow on Day 4, not Day 5; `SameSite=None; Secure` documented as the fallback |
| SSE buffered by Render's proxy | Medium | High | `X-Accel-Buffering: no`; verify on the deployed URL explicitly |
| Five-day scope overrun | High | High | Day-4 checkpoint with a pre-agreed cut list |
| Prisma Decimal ↔ number confusion | Medium | Medium | Convert at the API boundary only; a single `toNumber` helper; tests assert two-decimal precision |
| Seeded demo data looks artificial | Medium | Medium | Category-aware generation plus five planted scenarios (2.3.4) |
| Flaky E2E from real LLM latency | Medium | Low | 45s timeouts, `MOCK_PLATFORM_FAILURE_RATE=0`, fixed seed |

---

# Appendix C — Interview preparation checklist

You will get 10 minutes of Q&A plus questions during the demo. Be ready to open
the file and walk the code for each of these:

**Architecture**
- Why five agents instead of one prompt with all the data?
- Why is the confidence formula in code rather than from the model?
- Why an async generator for the orchestrator?
- What happens when one agent fails? Show the degradation path.

**Security**
- Walk through refresh token rotation and what reuse detection does.
- Why httpOnly cookies rather than localStorage? What did that cost you?
- Show me the four layers of tenant isolation.
- Why 404 instead of 403 for another tenant's resource?

**AI**
- How does the model decide which tools to call?
- What stops a recommendation below cost? (Three layers — name all three.)
- What did you change after the first version of the prompts?
- How would you evaluate whether the agents are actually any good?

**Engineering**
- Why Decimal for money?
- Why cursor pagination for recommendations but offset for products?
- Walk me through what happens when the platform API fails mid-execution.
- What is the lint rule about Prisma imports and why does it exist?

**Product**
- Why does the analyst need the agent trail at all?
- What would you cut if you had three days instead of five?
- What is the first thing you would build next, and why that?

For each answer, the pattern that works: state the decision, state the
alternative you rejected, state why — and where there is a genuine weakness, say
so before they find it. An honest "I applied RLS to three tables rather than
eleven because of the per-read transaction cost, and here is the trade-off"
reads far better than a claim that does not survive one follow-up question.

---

**End of implementation plan.**
