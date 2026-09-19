# CLAUDE.md — Pricewise

Project instructions. Read this before every task. These rules are not
suggestions; violating one is a bug even if the code works.

---

## 1. What this project is

**Pricewise** — a multi-tenant web app where a five-agent AI system produces
product pricing recommendations with confidence scores, and a human approves,
rejects or overrides them before anything reaches the storefront.

Built as a technical assessment for Klypup (Applied AI Intern, Option B).
**Five-day build window.** Graded on: full-stack engineering (30%), AI
integration quality (25%), architecture and code quality (20%), multi-tenancy
(15%), communication and product thinking (10%).

**The single most important constraint:** the assessment states *"you must be
able to explain every architectural decision and major code block during the
live interview. If you can't explain it, it doesn't count."*

This changes how you should work with me. See §9.

---

## 2. Source-of-truth documents

Read these before implementing anything. They all live in `docs/`.

| Document | Contains | When to consult |
|---|---|---|
| `docs/PRD.md` | ~200 numbered requirements (FR-*, AI-*, NFR-*, MT-*, TR-*), personas, journeys, edge cases, screen specs | Before building any feature |
| `docs/IMPLEMENTATION_PLAN.md` | Phases 0–6, exact file paths, code, acceptance criteria, commit messages | Before starting any phase |
| `docs/Pricewise_API_Contract.pdf` / `docs/openapi.yaml` | 19 endpoints, 18 schemas, error codes, SSE contract | Before writing any route |
| `docs/Pricewise_HLD.excalidraw` | Six architecture diagrams | For structural questions |

**If code and these documents disagree, the documents are right** — unless we
explicitly decide to change them, in which case update the document in the same
commit. Never let them silently drift.

When I ask for something that contradicts a document, say so before implementing.

---

## 3. Tech stack — do not substitute

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Bun | Package manager and runtime |
| Backend | Express | Chosen over Hono/Fastify because explicit middleware ordering *is* the security model |
| Frontend | React + Vite + Tailwind + shadcn/ui | |
| ORM | Prisma | |
| Database | Postgres — Docker locally, Supabase in production | |
| LLM | Groq via `groq-sdk` | Raw SDK, **hand-written tool loop** — no Vercel AI SDK, no LangChain |
| Validation | Zod, shared between client and server via `packages/shared` | |
| Server state | TanStack Query | |
| Forms | React Hook Form + zodResolver | |
| Charts | Recharts | |
| Auth | Custom JWT in httpOnly cookies | Not Supabase Auth |
| Password hashing | `Bun.password` (argon2id) | Fallback `@node-rs/argon2`. **Never** the `argon2` npm package — native gyp build |
| Tests | Bun test (backend), Vitest + RTL (frontend), Playwright (one E2E spec) | |

**Never add a dependency without asking.** If a task seems to need one, propose
it with a one-line justification and wait.

---

## 4. Architecture rules — non-negotiable

### R1 — Layering
`route → controller → service → repository`. One direction only.

- **Routes** declare path + middleware. No logic.
- **Controllers** read validated input, call *one* service function, shape the
  response envelope. No business `if` statements. Never import Prisma.
- **Services** hold all business logic. Take plain arguments (never `req`),
  return plain data (never `res`). Unit-testable without HTTP.
- **Repositories** are the only place `prisma.*` appears.

A lint rule enforces the Prisma restriction. If you hit it, you are in the wrong
layer — do not add an eslint-disable.

### R2 — Tenancy
Every service function touching tenant data takes `orgId` as its **first
positional parameter**, required and typed.

```ts
// correct
export async function listProducts(orgId: string, filters: ProductFilters) {}

// forbidden
export async function listProducts(opts: { orgId?: string; filters: F }) {}
```

`orgId` comes **only** from the verified JWT. A client-supplied
`organizationId` in a body or query is stripped and logged as suspicious.

Another org's resource returns **404, never 403** — a 403 confirms existence.

### R3 — Validation
Every body, query and param parsed with a Zod schema from `packages/shared`.
Handlers receive the *parsed* value, never raw `req.body`.

### R4 — Response envelope
```ts
{ success: true, data: {...}, pagination?: {...} }
{ success: false, error: { code, message, details? } }
```
No endpoint returns a bare array or string.

### R5 — Errors
Throw typed `AppError`. One `errorHandler` middleware maps to status codes.
No `res.status(500)` in a controller. No stack trace ever reaches a client —
return the correlation id instead.

### R6 — Secrets
Only `lib/env.ts` reads `process.env`, validated with Zod at boot, crashes on
missing/malformed. `process.env.X` anywhere else is a bug.

### R7 — Money
`Decimal`, never `Float`. Convert to number only at the API boundary. A rounding
error in a pricing product is not an acceptable class of bug.

### R8 — AI arithmetic
**The LLM supplies judgement; code supplies arithmetic.** Never let a model
compute: floor price, percentage delta, final confidence, margin, or whether a
rule is violated. Compute in TypeScript, pass into the prompt, re-verify after.

### R9 — Agent hand-offs
Agents exchange Zod-validated JSON objects, never prose. One schema-repair retry
showing the model its own validation error, then fail the agent.

### R10 — Concurrency
Any state transition that could race (approve / reject / modify) uses a
conditional claim — `updateMany({ where: { status: "PENDING" } })` — not
read-then-check. Read-then-check is a TOCTOU bug.

---


## 6. Testing rules

- A service function with a branch gets a unit test per branch.
- Every endpoint: one happy-path and one primary-failure integration test.
- Every tenant-owned endpoint: an isolation test (Org A cannot reach Org B).
- **Agent tests mock Groq entirely.** No test makes a network call — flaky and
  expensive CI kills the whole suite's value.
- Tests must pass before a commit closing a sub-phase.

---

## 7. Frontend rules

- Every async surface has an explicit **loading** state (skeletons matching real
  layout, not spinners — no layout shift).
- Every collection has **two distinct empty states**: "nothing here yet" vs
  "nothing matches your filter". Different situations, different copy.
- Every error state offers a **recovery action**.
- Accessibility **inline, never retrofitted**: keyboard reachable, visible focus,
  WCAG AA contrast, status never colour-only (confidence badges carry a number,
  delta chips carry an arrow), live region on the agent feed, respect
  `prefers-reduced-motion`.
- Client-side role checks are **UX only**. The API enforces independently.

---

## 8. AI/agent specifics

Five agents, strict responsibilities, no overlap:

| Agent | Owns | Tools | Model |
|---|---|---|---|
| Market Intelligence | Competitor position + trend | `get_competitor_prices`, `get_price_history` | fast |
| Inventory & Cost | Floor price, stock, days of cover | `get_inventory_and_cost` | fast |
| Demand Forecasting | Elasticity, seasonality, velocity | `get_demand_trends` | fast |
| Pricing Strategy | Synthesis → one price + rationale + factor weights | **none** | strong |
| Execution & Compliance | Rule validation, execute or route | `update_ecommerce_price` | strong |

Execution order: Market Intelligence ∥ Inventory & Cost → Demand Forecasting →
Pricing Strategy → Execution & Compliance → threshold branch.

**Rules:**
- An agent's output schema contains no field outside its responsibility. It
  cannot express an out-of-scope opinion because there's nowhere to put it.
- An agent only gets the tools its job needs.
- The **model** decides which tools to call. Never pre-fetch everything and stuff
  it into the prompt — the assessment explicitly requires the LLM to decide.
- Tools return `{ available: false, reason }` on missing data, never throw.
- Every agent invocation persists an `AgentRun` row: input, output, tool calls
  with arguments, confidence, model, token counts, duration, error.
- Confidence is computed by `computeConfidence()` in code — a weighted mean of
  agent self-reports minus **named** penalties, capped at 0.45 total deduction.
  It is never a number the model produced.
- Temperature 0.2. This is analysis, not prose; run-to-run variance is a defect.

---

## 9. How to work with me

This is the part that matters most, because of the "if you can't explain it, it
doesn't count" rule.

**Do:**
- Explain the *why* before or alongside the code, briefly. One or two sentences
  on the non-obvious decision is enough.
- Flag when you're about to do something I might not be able to defend, and
  offer the simpler alternative.
- Work in small increments I can actually read. One sub-phase at a time.
- Tell me when a plan document is wrong rather than silently working around it.
- Ask before adding a dependency, changing the schema, or deviating from the plan.

**Don't:**
- Don't add clever abstractions I didn't ask for. Boring, explainable code beats
  elegant code I have to reverse-engineer at 10pm before the interview.
- Don't silently fix something you noticed. Tell me what you found.
- Don't write comments that restate the code. Comment the *why* — the constraint,
  the trade-off, the thing that would look wrong to a reader who lacked context.

**After each meaningful block, tell me in one line what I'd need to be able to
explain about it.** If I can't, we simplify it.

---

## 10. Current state

| | |
|---|---|
| Phase | 0.0 — walking skeleton spike |
| Repo | see git log |
| Deployed | not yet |
| Groq models | **unresolved** — fill `GROQ_MODEL_FAST` / `GROQ_MODEL_STRONG` from the console |

**Known open items:**
- Confidence penalties + 0.80 threshold are a hypothesis — calibrate against seed
  data on Day 4 per `IMPLEMENTATION_PLAN.md` §3.8.1, then update the PRD.
- Render runtime (`node` vs native Bun) unverified — resolve in Phase 0.0.
- `Bun.password` viability unverified — resolve in Phase 0.0.

**Pre-committed cut list** (drop these first, no deliberation):
Postgres RLS · two of three Playwright specs · dashboard charts · URL-synced
filter state · bulk approve.

**Never cut:** the five-agent pipeline working end to end · tenant isolation and
its tests · README / ARCHITECTURE.md / DECISIONS.md · a working deployed URL ·
seed data.
