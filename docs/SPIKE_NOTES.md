# Phase 0.0, Walking skeleton spike: results

**Date:** 2026-09-17
**Purpose:** prove four unverified assumptions cooperate before scaffolding on them.
**Verdict:** all four viable. Three corrections to `IMPLEMENTATION_PLAN.md` required.

Environment: Bun 1.3.14 · Node 24.16 · PostgreSQL 17.11 (Homebrew) · macOS arm64.

---

## 1. Prisma under Bun, WORKS, with a rewrite

**Answer: yes, cleanly, and the reason is structural.** Prisma 7 deleted the Rust
query engine. Verified locally: `find` for `*.node` across `@prisma/client` and the
generated output returns nothing, and the generated client is plain TypeScript that
Bun executes natively. The historic Bun/Prisma friction was entirely about that
binary. Migration, generation and queries all ran under Bun with no workaround.

Results of `src/spike-db.ts`, 4/4:

```
PASS  row round-trips under Bun
PASS  Decimal survives to 2dp              currentPrice=329.99 cost=210.50
PASS  Decimal arithmetic works             margin=0.3621
PASS  JSON.stringify yields a string       {"price":"329.99"}
```

### Corrections to the plan

| Plan (§1.1) says | Prisma 7 requires |
|---|---|
| `generator client { provider = "prisma-client-js" }` | `provider = "prisma-client"` with a required `output`; `runtime = "bun"` is valid and accepted |
| `import { PrismaClient } from "@prisma/client"` | Import from the generated path, e.g. `./generated/prisma/client` |
| `new PrismaClient({ log })` | **Throws.** Needs a driver adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` |
| `url` / `directUrl` in the `datasource` block | Moves to a required `prisma.config.ts` |
| `bunx prisma …` | `bunx --bun prisma …`, the CLI's shebang is `#!/usr/bin/env node` |
| `migrate dev` implies generate + seed | Neither. `prisma generate` and `prisma db seed` are now explicit steps |

Unchanged and safe: model blocks, `@db.Decimal(10,2)`, `@@unique`, `$transaction`,
`$queryRaw`, `$executeRawUnsafe`.

### Version pinning, do not skip this

`bunx prisma --version` initially resolved **8.0.0-rc.15**, a release candidate, because the CLI was unpinned. The `prisma` npm `latest` dist-tag points at the RC
while `@prisma/client` `latest` points at 7.10.0, a known upstream bug. The CLI
even prompts to "upgrade" to the RC mid-migration. **Both packages are now pinned to
exact `7.10.0`, no caret.** Ignore the upgrade nag.

### New dependencies (unavoidable, not preference)

`@prisma/adapter-pg@7.10.0`, `pg`, `@types/pg`. Prisma 7 cannot connect without an
adapter. Avoiding them would mean pinning back to Prisma 6 and re-adopting the Rust
binary, the exact risk this spike removed.

### For the API boundary

`JSON.stringify` on a Decimal yields a **string** (`"329.99"`), not a number. Rule R7's
"convert only at the API boundary" is therefore load-bearing: every DTO mapper must
convert explicitly or the frontend silently receives strings where it expects numbers.

---

## 2. Password hashing, `Bun.password` is viable

**Answer: use `Bun.password`. `@node-rs/argon2` is not needed.** 9/9 checks passed.

```
PASS  produces an argon2id hash          $argon2id$v=19$m=19456,t=2,p=1$…
PASS  encodes the OWASP parameters       m=19456,t=2,p=1
PASS  salts each hash
PASS  verifies the correct password
PASS  rejects the wrong password
PASS  wrapped verify swallows a malformed hash
PASS  hashing cost is sane               18ms
```

### The one finding that matters

**Raw `Bun.password.verify()` throws on a malformed hash**
`Password verification failed with error "UnsupportedAlgorithm"`, it does not return
`false`. A corrupt or truncated hash in the database would surface as a 500 instead
of a failed login, which is both a bug and an information leak.

`lib/password.ts` must therefore wrap it. This exact helper is proven and goes into
Phase 1.3:

```ts
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    return false;   // a malformed hash reads as "wrong password", never as a 500
  }
}
```

At 18ms per hash the OWASP profile is comfortable on a login path.

---

## 3. Groq tool calling, WORKS, and the model genuinely drives it

**Answer: yes. Clean JSON, schema-valid first try, real multi-round tool use.**

Model: `openai/gpt-oss-20b`. Observed behaviour over two runs:

```
--- round 1 | finish_reason=tool_calls | get_competitor_prices {"lookbackDays":7}
--- round 2 | finish_reason=tool_calls | get_competitor_prices {"lookbackDays":30}
--- round 3 | finish_reason=stop      | final JSON
```

The model called the same tool twice with different arguments, a 7-day snapshot,
then a 30-day window to judge trend, entirely of its own accord. That satisfies the
assessment's explicit requirement that the LLM decides which tools to call rather
than following a hardcoded sequence, and it is worth demonstrating live.

### Raw output behaviour (the thing we came to measure)

| Question | Observed |
|---|---|
| Wrapped in a markdown fence? | **No** |
| Prose before the JSON? | **No** |
| Invented fields outside the schema? | **No** |
| Tool arguments well-formed? | **Yes**, clean JSON strings |
| Passed Zod on first attempt? | **Yes**, both runs |

Raw response, verbatim:

```json
{"competitorMin":279,"competitorMedian":289.99,"competitorMax":304.5,"trend":"stable","dataAgeDays":4,"notes":"Our price of $329.99 is above the current competitor range ($279–$304.50). Competitor prices have remained unchanged over the past 30 days, indicating a stable market position.","confidence":0.95}
```

**Implication for Phase 3:** the fence-stripping and brace-extraction fallbacks in
plan §3.1.3 are still worth keeping as defence, but they are not load-bearing for
this model. `response_format: json_object` was deliberately **not** used, so this is
the model's unaided behaviour. Do not assume the same of `gpt-oss-120b`, re-check
when the strategy agent is built.

### One typing gotcha

`groq-sdk`'s CJS (`.d.ts`) and ESM (`.d.mts`) declaration files disagree about which
parameter types their namespaces re-export, so `Groq.Chat.CompletionCreateParams`
and `Groq.Chat.Completions.ChatCompletionCreateParamsNonStreaming` both fail to
resolve under `moduleResolution: "bundler"` even though they appear in the source.
Deriving the type from the method instead is immune to this:

```ts
type CreateParams = Parameters<Groq["chat"]["completions"]["create"]>[0] & { stream?: false };
```

Everything runs regardless, Bun strips types without checking, but
`tsc --noEmit` fails, which would break CI. Worth knowing before Phase 3.1.

### Two observations for later

1. **Token usage runs 1.5–2.5× the PRD estimate.** One Market Intelligence run cost
   2,358–3,850 tokens across three rounds; PRD §19.2 budgets ~1,550 for this agent.
   Extrapolating, a five-agent pipeline is likely **12k–19k tokens, not 8.5k**. The
   cost model in PRD §19 should be re-derived from real `AgentRun` rows on Day 4.
2. **Self-reported confidence came back at 0.95** on clean data, supporting the
   concern that base confidence clusters high and any single penalty drops a
   recommendation below an 0.85 threshold. Calibrate against seed data before fixing
   the default.

---

## 4. Render runtime, resolved by research, not yet deployed

Deferred (no repo pushed yet), but the answers are settled and correct a wrong
assumption in plan §5.4:

- **There is no `runtime: bun` on Render.** Valid runtimes are `node`, `python`,
  `ruby`, `go`, `elixir`, `rust`, `docker`, `image`, `static`. Bun is *bundled into
  every native runtime*, on PATH at build and run time. So `runtime: node` plus
  `bun` commands is the officially supported pattern, the draft `render.yaml` was
  right. What it is missing is an explicit **`BUN_VERSION`** env var; the bundled
  default is old, so pin it to `1.3.14`.
- **SSE risk is compression, not proxy buffering.** Render's load balancers apply
  Brotli/gzip automatically, and an encoder holding small frames is the likely cause
  of "SSE arrives all at once". Send `Cache-Control: no-cache, no-transform`, keep
  `X-Accel-Buffering: no` (harmless, undocumented on Render), and **exclude the SSE
  route from any Express `compression()` middleware**. Verify with `curl -N` on the
  first deploy. Never proxy SSE through a Vercel rewrite, hit the API origin.
  Render allows 100-minute requests, so a 25s pipeline is safe.
- **Free tier spins down after 15 minutes idle, ~1 minute to wake.** An evaluator
  clicking a cold link waits 30–60s. Warm it before the demo.
- **Do not set a cookie `Domain`.** `onrender.com` is on the Public Suffix List, so
  a `Domain` attribute is rejected by browsers. `COOKIE_DOMAIN` must stay empty in
  production; omitting it makes the cookie host-only, which is what we want.
  `SameSite=None; Secure` is required and sufficient. This corrects plan §1.4.1
  and §5.4.3.

---

## 5. Zod 4, adopt, with two real fixes

Installed `zod@4.6.5`. Every Zod 3 idiom in the plan still runs (deprecated, not
removed), so nothing was blocked. Two findings beyond cosmetics:

1. **`z.coerce.boolean()` is a live bug in the plan's env schema (§0.3.1).** It is
   plain `Boolean()`, so `COOKIE_SECURE=false` parses to **`true`**, the inverse of
   intent, on a security flag. Use `z.stringbool()`.
2. **`z.toJSONSchema(schema, { target: "openapi-3.0" })` ships in 4.6.5**, which may
   remove the need for a Zod→OpenAPI generator dependency entirely.

Mechanical edits for Phase 1.2: `z.string().email()` → `z.email()`; `{ message }` →
`{ error }`; `.flatten()` → `z.flattenError()`; `.default()` now short-circuits, use
`.prefault()` for the old behaviour. `error.issues` remains canonical, so the
boot-time env loop works unchanged.

---

## 6. Deferred from this session

| Item | Why | Blocker |
|---|---|---|
| docker-compose (step 3) | Docker is not installed on this machine | Install Docker Desktop or OrbStack. Note ports 5432 and 8080 are both already occupied, compose needs `5433:5432` and `8081:8080`, or stop the brew Postgres |
| Render deploy (steps 9–10) | No repository pushed yet | git identity is unset, so nothing is committed |

The local Postgres 17.11 stood in for the container. The compose file still must be
verified before submission, because the README promises an evaluator
`bun run db:up` from a fresh clone.

---

## 7. What to change in IMPLEMENTATION_PLAN.md before Phase 0.1

1. Add a real **Phase 0.0** section, it is referenced by CLAUDE.md §10 and
   KICKOFF_PROMPT.md but does not exist in the plan.
2. Rewrite **§1.1** for Prisma 7 (generator, config file, adapter, import path, CLI flags).
3. Rewrite **§1.3.1** to use `Bun.password` with the mandatory try/catch wrapper.
4. Fix **§0.3.1**, `z.coerce.boolean()` → `z.stringbool()`.
5. Update **§5.4**, `BUN_VERSION`, compression-not-buffering for SSE, and no cookie `Domain`.
6. Flag **§19 cost model** (PRD) for re-derivation from real token counts on Day 4.
7. Housekeeping: CLAUDE.md §2 points at a `docs/` folder that does not exist; §10
   cites §3.8.1 which does not exist and states an 0.80 threshold where the plan and
   PRD say 0.85.

## 8. Spike artefacts (delete before Phase 0.1)

```
prisma/schema.prisma          prisma.config.ts
src/db.ts                     src/spike-db.ts
src/spike-password.ts         src/spike-agent.ts
src/groq-cache.ts             src/server.ts
```

`src/groq-cache.ts` is the one worth keeping, the dev response cache turned a
2,530ms three-call run into 5ms with zero network traffic, and a full pipeline is
8–15 calls.
