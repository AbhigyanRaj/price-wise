# Pricewise

A multi-tenant pricing tool where five AI agents produce a price recommendation
with a confidence score, and a human approves, rejects or overrides it before
anything reaches the storefront.

Built for the Klypup Applied AI Intern assessment, **Option B: Dynamic Pricing
Intelligence**.

| | |
|---|---|
| **Live** | _not yet deployed_ |
| **Architecture** | [ARCHITECTURE.md](ARCHITECTURE.md) |
| **Decisions** | [DECISIONS.md](DECISIONS.md) |
| **API contract** | [docs/openapi.yaml](docs/openapi.yaml) |

---

## Why Option B

Option A is a research assistant: type a question, get prose back. The
interesting engineering is retrieval.

Option B has something Option A does not: **a decision with consequences**. A
price change touches a storefront, which forces questions a chatbot never has
to answer. What happens when the model is confident and wrong? Who is
accountable when nobody clicked approve? What stops an LLM arithmetic slip from
selling below cost?

Those questions produced the parts of this codebase worth reading: a rule
engine that can veto the model, a confidence score the model is not allowed to
compute, and an audit trail that distinguishes a human approval from a machine
one.

---

## Running it

**Requirements:** [Bun](https://bun.sh) 1.3+, PostgreSQL 16+, and a free
[Groq API key](https://console.groq.com/keys).

```bash
git clone https://github.com/AbhigyanRaj/price-wise.git
cd price-wise
bun install

cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env: add GROQ_API_KEY, and two JWT secrets:
#   openssl rand -base64 48        (run it twice, they must differ)
```

**Database, either way:**

```bash
bun run db:up          # Docker Compose: Postgres on 5432, Adminer on 8080
# or point DATABASE_URL at any local Postgres you already have
```

```bash
bun run db:migrate
bun run db:seed
bun run dev            # API on :4000, app on :5173
```

Open **http://localhost:5173**.

If 5432 or 8080 is taken: `POSTGRES_PORT=5433 ADMINER_PORT=8081 bun run db:up`.

### Sign in

Seeded accounts, all with the password `Pricewise2026!`. These are throwaway
credentials for a demo database, not secrets.

| Email | Role | Organization |
|---|---|---|
| `admin@northwind.test` | Admin | Northwind Retail |
| `analyst@northwind.test` | Pricing Analyst | Northwind Retail |
| `admin@meridian.test` | Admin | Meridian Goods |
| `analyst@meridian.test` | Pricing Analyst | Meridian Goods |

**The two organizations are the multi-tenancy demo.** They share a database and
a schema, have zero overlapping SKUs, and different auto-execution policies
(0.80 and 0.75). Signing in as each shows a completely different catalogue.

You can also create your own workspace at `/signup`, or join one with an invite
code at `/join`.

---

## What to look at

**Catalog → open a product → Generate recommendation.** Five agents run live
over SSE. The two that run concurrently start on the same millisecond, which is
the architecture visible on screen rather than asserted in a diagram. Takes
about 8 seconds.

**Decisions → open one.** The rationale first, then the confidence broken into
a base score and named deductions, then every agent with the tools it called,
the arguments it chose and the source that answered. Nothing in that view is a
number you have to trust.

**Try to break it.** Modify a recommendation to a price below cost. A human
override is checked against the same margin floor as the AI, and comes back
with the rule that stopped it.

The seed plants five scenarios that each exercise a different branch:

| SKU | What it demonstrates |
|---|---|
| `NW-ELEC-0001` | Aggressive competitor undercut |
| `NW-ELEC-0007` | Margin floor blocks the obvious move |
| `NW-APPA-0003` | Demand surge with low stock |
| `MG-OUTD-0005` | Stale data penalty routes it to a human |
| `MG-BEAU-0009` | Market and demand disagree, disagreement penalty fires |

---

## How it fits together

Rendered inline rather than screenshotted: these diff in review and cannot
drift away from the repository the way an exported image does. Four more, the
data flow, the ER model, tenant isolation and the API surface, are in
[ARCHITECTURE.md](ARCHITECTURE.md).

### System architecture

```mermaid
graph TB
    subgraph browser["Browser"]
        UI["React 19 + Vite<br/>TanStack Query · Tailwind v4"]
    end

    subgraph vercel["Vercel"]
        CDN["Static bundle<br/>SPA fallback rewrite"]
    end

    subgraph render["Render"]
        direction TB
        MW["Middleware chain<br/>requestId → pino → helmet → CORS<br/>→ cookies → body limit → CSRF → rate limit"]
        RT["Routes<br/>auth · org · products · recommendations · audit · mock"]
        CT["Controllers<br/>shape request and response only"]
        SV["Services<br/>all business logic · orgId first arg"]
        AG["Agent orchestrator<br/>async generator, transport-agnostic"]
        RP["Repositories<br/>the only place prisma.* appears"]
    end

    subgraph supabase["Supabase"]
        PG[("PostgreSQL 16<br/>12 tables")]
    end

    GROQ["Groq API<br/>gpt-oss-20b · gpt-oss-120b"]
    MOCK["Mock e-commerce platform<br/>POST /mock/ecommerce/update-price"]

    UI -->|"static assets"| CDN
    UI -->|"fetch, credentials: include<br/>X-Pricewise-Client header"| MW
    UI -.->|"SSE, same origin<br/>never via a Vercel rewrite"| MW

    MW --> RT --> CT --> SV
    SV --> RP
    SV --> AG
    AG -->|"hand-written tool loop"| GROQ
    AG --> RP
    SV -->|"execute approved price"| MOCK
    RP -->|"pg driver adapter, pool max 5"| PG

    classDef ext fill:#2d2d3a,stroke:#7c6cf0,color:#fff
    class GROQ,MOCK ext
```

### The five-agent pipeline

Green is code, purple is the model. **The model supplies judgement; code
supplies arithmetic.**

```mermaid
flowchart TB
    START(["POST generate-recommendation"]) --> PREP["Load product<br/>Compute floor price, permitted range, max delta<br/><i>TypeScript, before any prompt</i>"]

    PREP --> W1A["Market Intelligence<br/>model: fast<br/>tools: get_competitor_prices, get_price_history"]
    PREP --> W1B["Inventory & Cost<br/>model: fast<br/>tools: get_inventory_and_cost"]

    W1A -->|"MarketIntelOutput"| W2
    W1B -->|"InventoryOutput"| W3

    W2["Demand Forecasting<br/>model: fast<br/>tools: get_demand_trends"] -->|"DemandOutput"| W3

    W3["Pricing Strategy<br/>model: strong<br/><b>no tools</b> — synthesis only"] --> CLAMP{"price inside<br/>permitted range?"}

    CLAMP -->|no| CAP["clamp to range<br/>cap confidence at 0.6"]
    CLAMP -->|yes| CONF
    CAP --> CONF

    CONF["computeConfidence()<br/><i>weighted mean − named penalties</i><br/>pure, deterministic, unit-tested"] --> RULES["checkBusinessRules()<br/><i>TypeScript</i><br/>BELOW_COST · MARGIN_FLOOR · MAX_DELTA"]

    RULES --> W4["Execution & Compliance<br/>model: strong<br/>sees the computed violations"]

    W4 --> GATE{"blocking violation<br/>OR agent says block?"}
    GATE -->|yes| HUMAN["PENDING<br/><i>a rule block always reaches a human,<br/>whatever the confidence</i>"]
    GATE -->|no| THRESH{"confidence ≥<br/>org threshold?"}
    THRESH -->|yes| AUTO["AUTO_EXECUTED<br/>push price, record PriceExecution"]
    THRESH -->|no| HUMAN

    AUTO --> FAILCHK{"platform accepted?"}
    FAILCHK -->|no| ROLLBACK["roll price back<br/>return to queue"]

    classDef code fill:#1e3a2f,stroke:#4ade80,color:#fff
    classDef llm fill:#2d2d3a,stroke:#7c6cf0,color:#fff
    class PREP,CONF,RULES,CAP code
    class W1A,W1B,W2,W3,W4 llm
```

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Bun | One toolchain for install, run and test |
| Backend | Express 5 | Explicit middleware ordering **is** the security model, and I wanted it reviewable as a list |
| Database | PostgreSQL + Prisma 7 | Money needs `DECIMAL`; tenancy needs foreign keys |
| LLM | Groq, raw SDK | Hand-written tool loop, no LangChain. See below |
| Validation | Zod 4, shared | One schema compiled into both client and server |
| Frontend | React 19 + Vite + Tailwind v4 | Static bundle, deploys anywhere |
| Auth | Custom JWT in httpOnly cookies | Refresh rotation with reuse detection is the part worth understanding |

Full reasoning, including what was rejected, in [DECISIONS.md](DECISIONS.md).

---

## The AI part

Five agents with non-overlapping responsibilities:

```
Market Intelligence  ┐
                     ├─ concurrent ─→ Demand ─→ Strategy ─→ Compliance
Inventory & Cost     ┘                                          │
                                              confidence ≥ threshold?
                                                ├─ yes → execute
                                                └─ no  → human queue
```

Four things that matter more than the agent count:

**A hand-written tool loop, about eighty lines.** No framework. The model
chooses which tools to call and with what arguments; nothing is pre-fetched and
stuffed into a prompt. In one recorded run the model called
`get_competitor_prices` with a 7-day window, read the result, then called it
again with 30 days unprompted.

**Scope is structural, not instructed.** No agent's output schema contains a
field outside its own responsibility, and no agent holds a tool outside its own
job. Market Intelligence has no inventory tool and no price field, so it cannot
express an out-of-scope opinion even if its prompt were ignored.

**The model supplies judgement; code supplies arithmetic.** The LLM never
computes the floor price, the delta, the margin, the final confidence, or
whether a rule is violated. `computeConfidence()` is a pure function: a
weighted mean of agent self-reports minus **named** penalties. Ask a model for
a confidence score twice and you get two numbers; this one is reproducible and
unit-tested.

**The rule engine outranks the model.** The Execution agent sees the computed
violations and may add a block, but it cannot remove one. A high-confidence
recommendation that breaches the margin floor still goes to a human.

---

## Tests

```bash
bun run typecheck && bun run lint
bun run test            # 186 tests: 113 backend, 73 frontend
```

Backend tests need a database: `TEST_DATABASE_URL=... bun run --cwd apps/backend test:setup` first.

**No test makes a network call.** Groq is mocked at the cache boundary, so the
real tool loop runs with zero traffic. A flaky, expensive suite is a suite
nobody trusts.

Coverage worth knowing about: a tenant-isolation suite asserting 404 and never
403; a concurrency test proving two simultaneous approvals resolve to one
winner and one 409; and a contrast test that parses the shipped stylesheet and
checks 21 colour pairs against WCAG AA in **both** themes, which already caught
one failing value in the design handoff.

CI runs typecheck, lint, the full suite against a Postgres service container,
and a production build.

---

## Known limitations

Stated rather than hidden.

- **Not deployed yet.** Manifests for Render and Vercel are in the repo and the
  code is ready for a split-origin deploy; the accounts are not linked.
- **Competitor and demand data are synthetic**, generated by
  `apps/backend/src/scripts/`. The tool interface is the real shape, so
  swapping in a live feed would not change the agents.
- **The e-commerce platform is a mock**, exposed as a real HTTP route so it is
  visibly an external system that can fail, with configurable failure and
  rollback.
- **Confidence is corrected, not calibrated.** The threshold was moved from
  0.85 to 0.80 on 13 measured runs because the original figure auto-executed
  23% against a 40-60% target. That fixes an obviously mis-set constant; it does
  not establish that the score predicts whether a human agrees. That needs human
  decisions to compare against. See DECISIONS.md §6.
- **`--t5` in the design palette is below WCAG AA** at 2.68:1, and the handoff
  uses it for the keyboard-hint strip. Recorded as a bounded exemption in the
  contrast test rather than passed over silently.
- **The Playwright E2E spec is written but has not been run here.** The browser
  download stalled repeatedly on this machine. `playwright install chromium`
  then `bun run test:e2e`.
- **Mobile is unhandled.** Desktop is the requirement and this is a dense data
  tool; the catalogue is a seven-column table.
- **Cut deliberately:** Postgres RLS as a defence-in-depth backstop, bulk
  approve, and URL-synced filter state.

---

## Layout

```
apps/backend     Express API, Prisma, the five agents
apps/frontend    React app
packages/shared  Zod schemas imported by both, so rules cannot drift
docs/            PRD, implementation plan, API contract, diagrams, spike notes
```

The backend follows `route → controller → service → repository`, one direction
only. Prisma may only be imported inside `repositories/`, and `process.env` may
only be read in `lib/env.ts`. **Both are enforced by lint rules rather than by
review**, which is what makes "every query is tenant-scoped" a checkable claim
rather than an assertion. It caught a real violation during the build.
