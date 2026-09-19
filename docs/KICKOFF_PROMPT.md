# Kickoff prompt — Pricewise, session 1

Paste the block below into Claude Code after you've put `CLAUDE.md`, `PRD.md`,
`IMPLEMENTATION_PLAN.md` and `docs/` in the project directory.

---

## The prompt

```
Read CLAUDE.md, then IMPLEMENTATION_PLAN.md section "Phase 0.0 — Walking
skeleton spike". Don't read the whole plan yet — Phase 0.0 and the Part 0
engineering rules are enough for this session.

CONTEXT
This is a 5-day technical assessment. I'm building Pricewise: a multi-tenant
pricing app where 5 AI agents produce price recommendations that a human
approves. Stack is Bun + Express + Prisma + Postgres + React + Groq.

I will be interviewed on this code and must be able to explain every line. That
constraint outranks speed. Work in small reviewable increments and explain the
non-obvious decisions as you go.

WHAT I WANT FROM THIS SESSION
Phase 0.0 only — the walking skeleton spike. The goal is NOT to build the
project. It's to prove the toolchain works together before I invest two days
scaffolding on top of unverified assumptions.

Four things have never been proven to co-operate on this machine:
  1. Bun running Prisma's query engine
  2. Bun.password (argon2id) — vs needing @node-rs/argon2
  3. Groq tool-calling returning output my Zod schemas accept
  4. All of the above on Render, not just locally

I want all four to fail today if they're going to fail at all.

TASKS, IN THIS ORDER

Step 1 — git
  git init if not already. Then commit the design documents as the first
  commits, so the history shows design preceded code:
    commit 1: "docs: add prd and implementation plan"
    commit 2: "docs: add api contract and high-level design"
  Create .gitignore FIRST (node_modules, dist, .env, .env.*, coverage,
  playwright-report, test-results, .DS_Store, *.log).
  Do not add Claude Code attribution or co-author trailers to commits.

Step 2 — minimal Bun project
  Not the full monorepo. A single flat directory with package.json, tsconfig,
  and a src/ folder. This is throwaway code — I'll delete it after the spike.
  Add: prisma, @prisma/client, groq-sdk, zod. Nothing else.

Step 3 — Postgres via docker-compose
  Just postgres:16-alpine + adminer, with a healthcheck. Verify it's up.

Step 4 — prove Bun + Prisma
  A minimal schema: one Product table (id, sku, name, currentPrice Decimal,
  cost Decimal, inventoryLevel) and one AgentRun table (id, agentName, input
  Json, output Json, promptTokens, completionTokens, durationMs, createdAt).
  Migrate. Write a script that inserts one product and reads it back.
  Run it with `bun run`. Report whether the query engine works cleanly under
  Bun, and if not, exactly what broke.

Step 5 — prove password hashing
  One script: hash a password with Bun.password (argon2id, memoryCost 19456,
  timeCost 2), verify it, verify a wrong password returns false not a throw.
  Tell me definitively whether Bun.password is viable or whether I need
  @node-rs/argon2.

Step 6 — prove Groq tool calling
  STOP before this step and ask me for my Groq model IDs. I need to fill them
  from the console — don't guess model names.

  Then: one agent, hand-written tool loop (no SDK abstraction), one tool, one
  Zod output schema.
    - Tool: get_competitor_prices(lookbackDays) returning hardcoded fake data
      in the shape { available: true, competitors: [...], summary: {...} }
    - Agent: a Market Intelligence system prompt asking for competitor position
    - Output schema: { competitorMin, competitorMedian, competitorMax,
      trend: "rising"|"falling"|"stable", dataAgeDays, notes, confidence }
    - The loop must handle: model requests tool → we execute → we append the
      result as a `tool` message → we call again → model returns final JSON.

  Then persist one AgentRun row with the real token counts and duration.

  IMPORTANT: also print the model's RAW response before parsing. I want to see
  what it actually returns — whether it wraps JSON in a markdown fence, invents
  fields, or formats tool arguments oddly. My Phase 3 prompts should be written
  against observed behaviour, not assumed behaviour.

Step 7 — dev response cache
  A tiny helper that, in development only, caches Groq responses keyed by a
  hash of {model, messages, tools}. One full pipeline run later will be 8–15
  API calls; I need to iterate on downstream code without burning rate limit on
  identical requests. Build it now, not later.

Step 8 — bare rendering
  One Express route serving an HTML page that shows the persisted AgentRun:
  agent name, the parsed output, tokens, duration. Ugly is fine. No React, no
  styling. I just need to see the data round-trip.

Step 9 — deploy
  Walk me through deploying this to Render while it's still tiny. Specifically
  resolve: does Render offer a native Bun runtime, or do I need runtime: node
  with a bun install in the build command? This is the thing I most want
  answered today rather than on day 5.

HOW TO WORK
- One step at a time. Show me the code, wait for me to say continue.
- Before writing the tool loop in step 6, explain in 3-4 sentences how the loop
  works — I need to be able to walk an interviewer through it.
- If something fails, don't silently work around it. Tell me what broke and
  what the options are.
- At the end of each step, give me the commit message.

DELIVERABLE AT END OF SESSION
A written summary of: what works, what broke, what I had to change from the
plan, and the four answers (Prisma-on-Bun, password hashing, Groq raw output
behaviour, Render runtime). I'll fold those back into IMPLEMENTATION_PLAN.md
before starting Phase 0.1.

Start with step 1.
```

---

## Follow-up prompts for later sessions

**Session 2 — Phase 0.1 to 0.6 (real scaffolding):**

```
Phase 0.0 is done — see SPIKE_NOTES.md for what we learned. Delete the spike
code. Now read IMPLEMENTATION_PLAN.md Phase 0 sections 0.1 through 0.6 and
build the real monorepo scaffold. Apply anything the spike taught us; if the
plan contradicts what we learned, flag it and I'll update the plan.

One sub-phase at a time, commit after each.
```

**Session 3+ — any later phase:**

```
Read CLAUDE.md, then IMPLEMENTATION_PLAN.md section "<phase number and name>".

Build only that sub-phase. Before you start, tell me:
  1. Which files you'll create or modify
  2. Any decision in the plan you think is wrong
  3. Anything you'd need me to decide first

Then implement, one file at a time. After each file, one line on what I'd need
to be able to explain about it.
```

**When you want a review rather than code:**

```
Don't write code. Review <file> against CLAUDE.md sections 4 and 8, and against
the requirements it implements in PRD.md. Tell me:
  - Any rule violation
  - Anything I'd struggle to explain in an interview
  - Anything the plan specified that isn't actually implemented
Rank by severity.
```

**Before the interview:**

```
Don't write code. I'm being interviewed on this tomorrow. Pick the 10 blocks of
code in this repo that an interviewer is most likely to ask about, and for each:
quote it, and give me the 3-sentence explanation I should have ready. Prioritise
the tool loop, tenant middleware, refresh rotation, confidence computation and
the execution rollback path.
```

---

## Notes on using these

- `CLAUDE.md` goes in the **project root**. Claude Code loads it automatically
  every session — you don't paste it.
- Keep `CLAUDE.md` §10 ("Current state") updated as you progress. It's the
  cheapest way to give a fresh session accurate context.
- The kickoff prompt deliberately stops before Groq to ask for model IDs. Have
  the console open.
- Resist the temptation to ask for a whole phase in one turn. The constraint
  you're optimising for is *your* ability to explain the code, and that's a
  function of how much you actually read.
