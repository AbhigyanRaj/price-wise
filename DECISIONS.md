# DECISIONS

Why this is built the way it is. Each section names the alternative I rejected
and what it would have cost, because a decision without a discarded option is
not a decision.

---

## 1. Which option, and why

**Option B, Dynamic Pricing Intelligence.**

Option A is a research assistant: a user types a question, an agent fans out to
data sources, and prose comes back. The interesting engineering is retrieval.

Option B has something Option A does not: **a decision with consequences**. A
price change touches a storefront. That forces questions a chatbot never has to
answer. What happens when the model is confident and wrong? Who is accountable
when nobody clicked approve? What stops an LLM arithmetic slip from selling
below cost?

Those questions produce a more interesting system. They are why this codebase
has a rule engine that can veto the model, a confidence score the model is not
allowed to compute, and an audit trail that distinguishes a human approval from
a machine one. None of that exists in a summarisation product.

The multi-agent requirement also fits the domain honestly. Competitor pricing,
inventory economics and demand elasticity are genuinely different kinds of
reasoning over genuinely different data. Splitting them is not ceremony to
satisfy a brief; it is how the tool grants work out.

---

## 2. Tech stack, and what I rejected

| Layer | Choice | Rejected | Why |
|---|---|---|---|
| Runtime | Bun | Node | Native TypeScript, one toolchain for install, run and test |
| Backend | Express 5 | Hono, Fastify | See below |
| ORM | Prisma 7 | Drizzle, raw SQL | Migrations and a typed client without hand-writing DDL |
| Database | Postgres | MongoDB | Money needs `DECIMAL`, and tenancy needs foreign keys |
| LLM | Groq, raw SDK | LangChain, Vercel AI SDK | See §4 |
| Validation | Zod 4, shared | Separate client/server rules | One schema, no drift |
| Auth | Custom JWT in cookies | Supabase Auth, Auth0 | See below |
| Frontend | React + Vite + Tailwind | Next.js | No server rendering needed; a static bundle deploys anywhere |

**Express over Hono or Fastify.** Hono is faster and Fastify has better
ergonomics. I picked Express because **explicit middleware ordering is the
security model here**, and I wanted that ordering to be a visible, reviewable
list rather than a framework convention. `app.ts` reads top to bottom:
correlation id, logging, helmet, CORS, cookie parsing, body limit, CSRF guard,
rate limit, then routes. Every line carries a comment explaining why it sits
where it sits. When a reviewer asks "what stops a cross-site form post", I point
at a line rather than at documentation.

**Custom JWT over Supabase Auth.** Supabase Auth would have been faster and I
would have learned nothing from it. Refresh-token rotation with reuse detection
is the part of auth most worth understanding: each refresh token records the one
it replaced, so presenting an already-rotated token means two parties hold it,
which is a theft signal, and the whole chain is revoked. That is a decision I
can defend. "Supabase handles it" is not.

**One cost constraint shaped the stack.** Everything runs on free tiers: Groq's
free API, Supabase free Postgres, Render free web service, Vercel hobby. That is
why the mock e-commerce platform is mock, why competitor data is synthetic, and
why the Render service sleeps after 15 minutes. It is noted here because the
brief asked for cost constraints to be stated.

---

## 3. Multi-tenancy

**Pattern: shared database, shared schema, `organizationId` column, enforced at
the repository boundary.** The brief allows this and says it cares that the
pattern is understood and implemented correctly, not that it is enterprise-grade.

Four properties, in increasing order of how much I like them:

**1. `orgId` is the first positional parameter of every service function that
touches tenant data.**

```ts
export async function listProducts(orgId: string, filters: ProductFilters) {}
```

Not an options bag with an optional `orgId`. Positional and required means
forgetting it is a **compile error**, not a leak. This is the cheapest possible
enforcement: the type system does the work.

**2. `orgId` comes only from the verified JWT.** A client-supplied
`organizationId` in a body or query is stripped and logged as suspicious. There
is no code path where user input reaches a tenant filter.

**3. Another tenant's resource returns 404, never 403.** A 403 confirms the row
exists, which leaks the id space and lets an attacker enumerate. This is
asserted directly in `tests/integration/tenancy.test.ts`.

**4. The repository layer is the only place a Prisma query is constructed, and
that is enforced by a lint rule, not by code review.**

```js
// eslint.config.mjs
"no-restricted-imports": [/* Prisma client banned outside repositories/ */]
```

This is the one I would lead with. "Every query is tenant-scoped" is an
unverifiable claim in most codebases, because any file can open a connection.
Here it is checkable: queries exist in exactly one directory, and CI fails if
that stops being true. It caught a real violation of mine during the build, when
I put a transaction in a service.

The same idea extends to the agents. Every tool receives a `ToolContext`
carrying `orgId`, and the repository call underneath requires it, so **a tool
physically cannot read another tenant's data** even if its prompt were fully
compromised. Tenancy is structural rather than a check that could be forgotten.

**What I did not do:** Postgres row-level security. It was on the pre-committed
cut list as a defence-in-depth backstop, not a primary control. The primary
control is the layering above, and RLS would have added a second mechanism to
explain without changing the guarantee.

---

## 4. AI integration

### The shape

Five agents, strict non-overlapping responsibilities:

```
Market Intelligence  ┐
                     ├─ concurrent ─→ Demand Forecasting ─→ Pricing Strategy ─→ Execution & Compliance
Inventory & Cost     ┘                                                                    │
                                                                        confidence ≥ threshold?
                                                                          ├─ yes → execute
                                                                          └─ no  → human queue
```

### A hand-written tool loop, not a framework

No LangChain, no Vercel AI SDK. The loop is about eighty lines against the raw
Groq SDK: send messages, check for `tool_calls`, execute them in parallel, push
results back as `role: "tool"`, repeat until the model returns content, then
parse against a Zod schema with one repair retry.

I wrote it by hand for two reasons. The brief says I must be able to explain
every major code block, and a framework's control flow is exactly the thing you
cannot explain when asked. And the property the assignment actually tests, that
**the model decides which tools to call**, is easier to demonstrate in eighty
readable lines than to prove through an abstraction.

That property is real, not asserted. In the Phase 0.0 spike the model called
`get_competitor_prices` with `lookbackDays: 7`, read the result, and called it
again with `lookbackDays: 30` unprompted. In a run recorded during verification,
Market Intelligence chose two tools while the other agents chose one. Nothing is
pre-fetched and stuffed into a prompt.

### Prompt engineering decisions

**An agent's output schema contains no field outside its responsibility.** The
Market Intelligence schema has no price recommendation field. It is not told to
stay in its lane; it has **nowhere to put an out-of-scope opinion**. Structure
enforces scope better than instruction does.

**An agent only gets the tools its job needs.** Market Intelligence has no
inventory tool, so it cannot reason from stock levels even if its prompt were
ignored entirely.

**Agents exchange Zod-validated JSON, never prose.** Prose hand-offs compound
error: each agent reinterprets the last one's phrasing. One schema-repair retry
shows the model its own validation error, then the agent fails cleanly.

**Temperature 0.2.** This is analysis, not writing. Run-to-run variance on the
same inputs is a defect, not creativity.

**System prompt for the role, user prompt for the data.** The role is stable and
cacheable; the data changes every call.

### The rule that shaped everything: the model supplies judgement, code supplies arithmetic

The LLM never computes the floor price, the percentage delta, the margin, the
final confidence, or whether a rule is violated. All of it is TypeScript,
computed before the prompt and re-verified after.

Three places this shows up:

**Confidence is computed in code.** A model's self-reported score is
uncalibrated and unreproducible: ask twice, get two numbers. So each agent
reports confidence in its own narrow analysis, which models are comparatively
decent at, and `computeConfidence()` combines them as a weighted mean minus
**named** penalties, capped at 0.45 total deduction. The output is not a number;
it is a list a human can audit:

```
base      0.870
penalty  -0.100  Market trend and demand trend point in opposite directions
penalty  -0.050  1 inventory constraint(s) active
final     0.720
```

That function is pure. Same inputs, same output, no clock, no I/O, unit-tested
per branch. The frontend renders it as a waterfall, so "why 0.72" has an answer
with arithmetic behind it.

**The price is clamped, and ignoring the constraint costs confidence.** The
strategy agent is told the permitted range. It is also clamped to that range in
code afterwards, and if the clamp fires its confidence is capped at 0.6, because
an agent that ignored an explicit stated constraint has just demonstrated it is
less reliable on this case.

**The rule engine is authoritative over the model.** `checkBusinessRules()`
computes violations in TypeScript. The Execution agent sees them and may add a
block, but it cannot remove one:

```ts
const blocked = hasBlockingViolation(violations) || compliance?.decision === "block";
```

### The question I expect to be asked: what does agent five actually do?

If the rules are computed in code and the LLM can only tighten, never loosen,
is the fifth agent doing work or performing?

It is a supervisory second opinion with no authority over the deterministic
rules. It catches the cases the rule engine does not encode, such as a
technically-legal price that is strategically incoherent given what the upstream
agents found, and it produces the human-readable compliance note. The moment it
disagrees with the rule engine in the permissive direction, the rule engine
wins.

I would rather state this plainly than have it discovered. If the honest answer
were "it adds nothing", the right move would be to delete it, and a four-agent
pipeline that does real work beats a five-agent pipeline with a passenger.

**Related, and deliberate:** the Execution agent does not hold the
`update_ecommerce_price` tool. Price execution happens in
`execution.service.ts`, in TypeScript, after the decision is made. An LLM should
not be the component that fires an irreversible side effect on a storefront;
tool-calling is for gathering information, and the write path is code with
explicit rollback. The earlier design had it as an agent tool and I moved it.

### Failure handling

Tools return `{ available: false, reason }` rather than throwing, and a failed
tool is handed back to the model **as data**. The model can then reason about
the gap, and the missing input becomes a named confidence penalty instead of a
crash. A failed agent degrades the run rather than aborting it; only a missing
cost floor is a hard stop, because you cannot price without knowing what you
paid.

---

## 5. Trade-offs made for the five-day timeline

Cuts were pre-committed on day one, so that under pressure I was executing a
decision rather than making one:

| Cut | Reasoning |
|---|---|
| Postgres RLS | Defence in depth, not the primary control |
| URL-synced filter state | Real UX polish, invisible in a demo |
| Bulk approve | Cut, then built anyway once the single-item path was solid: partial success needed stating plainly rather than a count that lies |
| Two of three Playwright specs | One spec, five tests, covering the critical journey. Running it for the first time found four real bugs, which says the cut was right but the delay was not |
| Dashboard charts | Not required by Option B; the waterfall is the chart that matters |

Deliberately **not** cut, in priority order: the five-agent pipeline working end
to end, tenant isolation and its tests, the three documents, and seed data a
reviewer can use immediately. A deployed URL sits behind those: the brief lists
deployment as a bonus, and a working local clone was worth more than a live one
that had cost time the pipeline needed.

Two honest process notes:

**I over-planned.** A 1,500-line PRD and a 5,000-line implementation plan for a
five-day build is more specification than the timeline warranted. It paid off in
consistency and it is why this document could be assembled rather than invented,
but a day of it would have been better spent on the frontend.

**I under-tested the frontend relative to the backend.** 132 backend tests
against 96 frontend ones, and the frontend ones still cluster on pure logic (the
SSE parser, colour contrast, metric formatting, CSV escaping) because those are
cheap. Component interaction tests are thinner than they should be, and the
five end-to-end tests are carrying more of that weight than they ought to.

---

## 6. What I would do with two more weeks

**First, learn whether the confidence score means anything.** Right now it is a
formula whose weights and penalties I chose by reasoning, not by evidence. With
two weeks I would log every human decision, compare it against the score, and
fit the weights to what analysts actually do. A confidence score that does not
predict human agreement is decoration. This is the single highest-value thing
on the list, and everything below is smaller.

**Second, close the learning loop.** Rejection reasons are captured and shown as
historical context, and then nothing happens to them. They should feed back:
five rejections on a category for the same reason should move that category's
confidence penalty, not just sit in a list.

**Third, make the pipeline a queue.** The orchestrator is an async generator
that knows nothing about HTTP, precisely so a worker could consume it instead of
an SSE route. Right now a run holds a request open for 25 seconds, which does
not survive a repricing of 500 SKUs. The refactor is small because the seam is
already there.

Then, in order: real competitor data behind the existing tool interface, since
the tool contract would not change; A/B testing of prices across segments, which
is where a pricing product earns its keep; per-category confidence thresholds,
because electronics and perishables do not deserve the same caution; and the
frontend component test coverage noted above.

---

## 7. The hardest part

Not the agents. **Deciding what the LLM is not allowed to do.**

The first version let the model return a confidence score and check its own
margin arithmetic. It worked, demoed well, and was quietly indefensible. Asked
twice on identical input it returned 0.87 and 0.91. That is not a measurement,
and I was about to put it in front of a pricing decision.

Rewriting it meant accepting that the interesting part of the system is the
boring part: a pure function, a weighted mean, a list of named deductions, a
rule engine that can overrule the model. The LLM's job shrank to what it is
actually good at, reading a messy situation and reporting a narrow judgement,
and everything that had to be *correct* moved into code with tests around it.

The general lesson, and the one I would give to the next person: **decide what
the model is not allowed to touch before you decide what it does.** The
boundary is the architecture. Everything else is prompt tuning.

A concrete instance from this week, caught during verification rather than
design: I set the auto-execution threshold to 0.85 as a hypothesis, then
measured the confidence the pipeline actually produces. See
[CALIBRATION](#calibration) below. The number I had written down and the number
the system produced were not the same, and the fix was to believe the
measurement.

---

## Calibration

The auto-execution threshold started at **0.85**, chosen by reasoning before a
single pipeline run existed. Near the end of the build I measured what the
system actually produces, across **13 live runs** on distinct SKUs:

```
final confidence   min 0.70   median 0.77   mean 0.784   max 0.88
base score         median 0.85
mean total penalty 0.038      (5 of 13 runs took no penalty at all)

threshold 0.85 ->  3/13 (23%) auto-execute
threshold 0.80 ->  6/13 (46%) auto-execute
threshold 0.75 ->  8/13 (62%) auto-execute
```

The product target is 40 to 60% auto-execution. At 0.85 the real figure is 23%,
so the system was routing far more to humans than intended and a reviewer could
plausibly run a demo without ever seeing auto-execution fire. **The default is
now 0.80**, which lands at 46%, inside the band. It remains per-organization
configurable, and the two seeded tenants deliberately differ (0.80 and 0.75) so
the setting is visibly a policy rather than a constant.

Three things this exercise turned up that are worth more than the number:

**1. My first measurement was wrong, and measuring the right thing changed the
answer.** I initially measured the *seeded* recommendations and got a median of
0.81 with 57% clearing 0.80. Then I read `seedRecommendations.ts` and found the
seeded confidences were `rng.between(0.72, 0.95)` run through a **re-implementation**
of the confidence formula, not `computeConfidence()` itself. I had measured the
seed generator and nearly wrote it into this document as a property of the
pipeline.

**2. The seed has been rewired to call the real function.** It now builds typed
agent outputs and passes them to `computeConfidence()`, so a seeded breakdown is
something the live system could genuinely produce. Two defects surfaced
immediately once the real penalties applied: the seed reported `dataAgeDays` as
the age of the *oldest* competitor record rather than the freshest, so every
seeded row took the stale-data penalty; and `daysOfCover` was a free random
divisor that put most products outside the healthy band, so the
inventory-constraint penalty fired almost always. Seeded confidence now tracks
live output closely (seeded mean 0.790 against live 0.784) and seeded status can
no longer contradict seeded confidence: nothing claims to have auto-executed
below the threshold that governs auto-execution.

**3. A high-confidence recommendation can still be blocked, and that is correct.**
One run scored 0.83, above the threshold, and stayed `PENDING` because
`MARGIN_FLOOR` fired. The rule engine outranks the confidence score, by design.
That case also exposed a cosmetic bug worth fixing: the violation read
*"Margin 10.0% is below the 10.0% floor"*, a float landing a fraction under the
floor and both numbers rounding to the same display value. The rule was right to
fire, and rounding toward blocking is the safe direction for a floor, but the
message read as a contradiction to the analyst being asked to act on it. It now
prints at whatever precision actually separates the two figures.

**What this does not establish.** 13 runs on synthetic data is enough to correct
an obviously mis-set constant; it is not enough to claim the score is
*calibrated*. Calibration means the score predicts whether a human agrees, and
that needs human decisions to compare against. See §6.

---

## Smaller decisions worth a line each

- **`Decimal`, never `Float`, for money**, converted to `number` only at the API
  boundary. A rounding error in a pricing product is not an acceptable class of
  bug.
- **State transitions use a conditional claim**, `updateMany` with the expected
  status in the `where` clause, not read-then-check. Two analysts clicking
  approve at once resolve to one winner and one 409. Read-then-check is a
  time-of-check-to-time-of-use bug.
- **A human override is validated against the same margin floor as the AI.** The
  human is there to catch the model's judgement errors, not to be exempt from
  arithmetic. Overriding to a below-cost price returns 422 with the named rule.
- **`Bun.password` over the `argon2` npm package**, which needs a native gyp
  build. Wrapped in try/catch because `Bun.password.verify()` **throws** on a
  malformed hash rather than returning false, which would surface as a 500 and
  leak the difference between a wrong password and a corrupt record.
- **`z.stringbool()` over `z.coerce.boolean()`** for `COOKIE_SECURE`. The latter
  is plain `Boolean()`, so the string `"false"` reads as `true` and silently
  disables a security flag. Found during the spike.
- **No cookie `Domain` attribute.** `onrender.com` is on the Public Suffix List,
  so browsers reject one there. Host-only is the behaviour we want anyway.
- **Cross-site cookies are `SameSite=None; Secure; Partitioned`**, both flags
  derived from one variable so the invalid combination, `None` without `Secure`,
  which browsers silently discard, is unrepresentable. CSRF is still blocked by
  a required custom header that a cross-site form cannot set.
- **Prisma 7 works under Bun because Prisma 7 deleted the Rust query engine.**
  The generated client is plain TypeScript and takes a `pg` driver adapter, so
  there are no native binaries to be incompatible. Verified in the spike before
  committing to the stack.
- **The mock platform is an HTTP route, not an in-process function**, so it is
  visibly an external system that can fail, with configurable failure and
  rollback.
