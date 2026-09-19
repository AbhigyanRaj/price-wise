# Pricewise, Dynamic Pricing Intelligence Platform

Multi-tenant web application where a five-agent AI system produces product pricing
recommendations with confidence scores, and a human approves, rejects or overrides
them before anything reaches the storefront.

Built as a technical assessment for Klypup (Applied AI Intern, Option B).

> **Status:** in development. See `SPIKE_NOTES.md` for Phase 0.0 toolchain findings,
> `PRD.md` for requirements and `IMPLEMENTATION_PLAN.md` for the build plan.

## Setup

```bash
git clone <url> && cd pricewise
cp apps/backend/.env.example apps/backend/.env    # add your GROQ_API_KEY
bun install
bun run db:up && bun run db:migrate && bun run db:seed
bun run dev
```

If port 5432 or 8080 is already in use on your machine:

```bash
POSTGRES_PORT=5433 ADMINER_PORT=8081 bun run db:up
```

## Stack

| Layer | Choice |
|---|---|
| Runtime | Bun 1.3 |
| Backend | Express + Prisma 7 + PostgreSQL |
| Frontend | React + Vite + Tailwind + shadcn/ui |
| LLM | Groq (`groq-sdk`, hand-written tool loop) |
| Validation | Zod 4, shared between client and server |
