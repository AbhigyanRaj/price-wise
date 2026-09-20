# Pricewise
## Product Requirements Document

| | |
|---|---|
| **Product** | Pricewise — AI-assisted dynamic pricing intelligence |
| **Document type** | Product Requirements Document (PRD) |
| **Version** | 1.0 |
| **Status** | Approved for build |
| **Author** | Abhigyan |
| **Context** | Klypup Applied AI Intern — Technical Assessment, Option B |
| **Build window** | 5 calendar days |
| **Related documents** | `openapi.yaml`, `Pricewise_HLD.excalidraw`, `ARCHITECTURE.md`, `DECISIONS.md` |

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Problem statement](#2-problem-statement)
3. [Goals and non-goals](#3-goals-and-non-goals)
4. [Success metrics](#4-success-metrics)
5. [Personas](#5-personas)
6. [Jobs to be done](#6-jobs-to-be-done)
7. [User journeys](#7-user-journeys)
8. [Scope](#8-scope)
9. [Functional requirements](#9-functional-requirements)
10. [AI product requirements](#10-ai-product-requirements)
11. [Trust, explainability and human agency](#11-trust-explainability-and-human-agency)
12. [Multi-tenancy and access control](#12-multi-tenancy-and-access-control)
13. [Non-functional requirements](#13-non-functional-requirements)
14. [Information architecture](#14-information-architecture)
15. [Screen specifications](#15-screen-specifications)
16. [Data requirements](#16-data-requirements)
17. [Edge cases and error states](#17-edge-cases-and-error-states)
18. [Analytics and instrumentation](#18-analytics-and-instrumentation)
19. [Cost model](#19-cost-model)
20. [Release plan](#20-release-plan)
21. [Risks and mitigations](#21-risks-and-mitigations)
22. [Open questions](#22-open-questions)
23. [Appendix A — Glossary](#appendix-a--glossary)
24. [Appendix B — Requirement traceability](#appendix-b--requirement-traceability)
25. [Appendix C — Competitive context](#appendix-c--competitive-context)

---

# 1. Executive summary

Pricewise is a multi-tenant web application that replaces manual, spreadsheet-driven
product repricing with a multi-agent AI system that monitors market conditions
continuously, produces priced recommendations with confidence scores and written
rationale, and routes those recommendations through a human approval workflow.

**The one-sentence pitch:** a pricing team of six that currently reprices 500 SKUs
once a week can reprice them within minutes of a market move, without giving up
control of a single price change.

**What makes it different from "an AI that sets prices":** every recommendation
arrives with its working shown. Five specialist agents each contribute a narrow,
auditable analysis; the confidence score is assembled arithmetically from named
components rather than guessed by a model; and nothing above a configurable risk
threshold executes without a human clicking approve. The product is designed
around the assumption that a business will not let a model touch revenue unless it
can see why the model believes what it believes.

**Primary deliverable of this build:** a working, deployed application
demonstrating three live workflows — AI recommendation generation, multi-tenant
data isolation, and role-based access — plus the architecture documentation
explaining how it works.

---

# 2. Problem statement

## 2.1 The situation

A mid-size e-commerce retailer sells 500+ SKUs across several categories
(electronics, home goods, apparel). Prices are reviewed manually on a weekly
cycle. A pricing analyst exports competitor prices into a spreadsheet, cross-
references internal inventory and cost data from a second system, applies
judgement, and updates prices in the storefront admin.

## 2.2 What it costs them

| Symptom | Consequence |
|---|---|
| Weekly repricing cadence | A competitor's Tuesday price cut is unanswered until the following Monday — six days of lost conversion or lost margin |
| Static prices on slow movers | Inventory ages into forced markdown instead of being cleared gradually at better realised margin |
| No mechanism for demand surges | Seasonal peaks and viral moments pass without any price response, leaving margin on the table |
| 70% of analyst time spent gathering data | Six analysts, four of whom are effectively doing data entry rather than pricing strategy |
| Estimated revenue leakage | 8–12% |

## 2.3 Why the obvious solutions fail

**"Just automate it with rules."** Rule engines are brittle. A rule that says
"match the lowest competitor minus 2%" will happily price below cost when a
competitor runs a loss-leader promotion, and has no way to know that this SKU is
nearly out of stock and should be priced *up*, not down.

**"Just ask a language model."** A single prompt containing all the data produces
plausible prose and an unverifiable number. It cannot tell you which factor drove
the decision, its confidence is not reproducible between runs, and no pricing
manager will authorise a model to change 500 prices on that basis.

**"Buy an enterprise pricing platform."** Viable at scale, but the implementation
cost and integration burden are disproportionate for a mid-size catalog, and the
model is typically a black box — which reintroduces the trust problem.

## 2.4 The opportunity

The bottleneck is not the pricing decision. Analysts are good at those. The
bottleneck is the **data gathering that precedes the decision**, and the
**latency** that gathering imposes.

Pricewise automates the gathering and the analysis, presents the result in a form
a human can verify in fifteen seconds, and keeps the human in the decision loop
wherever the stakes justify it. The analyst's job changes from *assembling
evidence* to *adjudicating conclusions* — which is both faster and a better use
of their expertise.

---

# 3. Goals and non-goals

## 3.1 Product goals

| ID | Goal | Rationale |
|---|---|---|
| G-1 | Reduce time-to-decision on a competitor price move from ~6 days to under 5 minutes | This is the core value proposition; everything else supports it |
| G-2 | Every recommendation must be explainable to a non-technical pricing analyst in under 60 seconds | Adoption fails without trust; trust requires legibility |
| G-3 | No price change reaches the storefront without either human approval or an explicitly configured auto-execution rule | The product must never be experienced as "the AI changed our prices" |
| G-4 | A complete, immutable record of every price change, who authorised it, and what the AI had recommended | Required for commercial accountability and for eventually evaluating model quality |
| G-5 | Multiple organizations operate on one deployment with zero data visibility between them | The product is multi-tenant by design, not retrofitted |

## 3.2 Engineering goals

| ID | Goal |
|---|---|
| EG-1 | AI is a feature inside a product, not the product — auth, CRUD, persistence and UI are first-class |
| EG-2 | The LLM decides which tools to call based on the query; no hardcoded fetch sequence |
| EG-3 | AI output is rendered as structured UI components, never as a wall of text |
| EG-4 | Tenant isolation is enforced at the query level and verifiable by test |
| EG-5 | The system degrades rather than crashes when the LLM is slow, rate-limited, or unavailable |

## 3.3 Non-goals for this release

Explicitly out of scope, and stated here so scope creep is a decision rather than
an accident:

| ID | Non-goal | Why |
|---|---|---|
| NG-1 | Real competitor scraping | Legally and operationally involved; synthetic data with realistic patterns demonstrates the same architecture |
| NG-2 | Real e-commerce platform integration (Shopify, Amazon, etc.) | A mock platform API with induced failures exercises the identical execution and rollback logic |
| NG-3 | Scheduled/batch repricing across the whole catalog | Requires a job queue; per-SKU on-demand generation proves the pipeline |
| NG-4 | Machine-learned demand models trained on historical data | The agent estimates elasticity from signals; a trained model is a future phase |
| NG-5 | Transactional email (invites, notifications) | Invite codes avoid an external dependency that adds nothing to the evaluated architecture |
| NG-6 | Mobile-native applications | Responsive web is sufficient; desktop is the analyst's actual environment |
| NG-7 | Multi-currency and multi-region pricing | Single currency keeps the pricing maths legible |
| NG-8 | A/B price experimentation | Listed as a bonus in the brief; deferred as a stated future phase |
| NG-9 | SSO / SAML | Custom JWT auth demonstrates the security thinking; enterprise SSO is a later concern |

---

# 4. Success metrics

## 4.1 Product metrics (how we would judge this in production)

| Metric | Definition | Target |
|---|---|---|
| Time to respond to a competitor move | Competitor price change detected → our price updated | < 5 minutes |
| Analyst throughput | Recommendations resolved per analyst-hour | ≥ 40 |
| Auto-execution rate | Share of recommendations clearing the confidence threshold | 40–60% (too high suggests the threshold is lax; too low suggests the model is weak) |
| Override rate | Share of recommendations a human modifies rather than approves as-is | < 20%, trending down |
| Rejection rate | Share rejected outright | < 10% |
| Time-to-decision per recommendation | Detail page opened → action taken | < 60 seconds median |
| Rollback rate | Executions failing at the platform | < 2% |

**Note on override rate as a model-quality signal:** every modification stores both
the AI's price and the human's chosen price. The distribution of that delta over
time is the most honest available measure of whether the agents are any good, and
it is captured from day one specifically so that measurement becomes possible
later.

## 4.2 Assessment metrics (how this build is actually judged)

Mapped directly to the published rubric:

| Criterion | Weight | How this PRD addresses it |
|---|---|---|
| Full-stack engineering | 30% | §9 functional requirements, §15 screen specs, §13 NFRs |
| AI integration quality | 25% | §10 AI product requirements, §11 explainability |
| Architecture & code quality | 20% | Implementation plan + HLD; §13 NFRs |
| Multi-tenant implementation | 15% | §12 tenancy and access control |
| Communication & product thinking | 10% | This document, §2 problem framing, §19 cost model |

---

# 5. Personas

## 5.1 Primary — Priya, Pricing Analyst

- **Role:** reviews and acts on pricing recommendations; owns day-to-day price positioning for two categories
- **Tenure:** 3 years in pricing, came from merchandising
- **Technical level:** expert in Excel, comfortable with BI dashboards, not a programmer
- **Current workflow:** Monday morning export, four hours of spreadsheet work, bulk update Tuesday
- **What she actually wants:** to stop doing the export, and to keep the judgement
- **What makes her distrust a tool:** a number with no explanation; being told a price changed after the fact; a system that is confidently wrong once and never acknowledges it
- **Success for Priya:** she opens a queue of 12 recommendations, understands each in under a minute, approves most, overrides two with reasons, and is done in fifteen minutes instead of four hours

**Design implications:** the queue must be scannable and the detail page must be
readable in a single screen without scrolling to find the reasoning. Bulk actions
must exist. Every AI number must be traceable to a source.

## 5.2 Secondary — Marcus, Pricing Manager (Admin)

- **Role:** owns the pricing function; configures the rules the system operates under; accountable to finance for margin
- **Technical level:** comfortable with analytics tools, not technical
- **What he needs:** confidence that the system cannot do something commercially catastrophic, and a record when it does something
- **His first question:** "What stops this thing selling below cost?"
- **His second question:** "If I'm on holiday, what executes without a human?"
- **Success for Marcus:** he sets a confidence threshold and margin floors once, and can answer any question from finance about any price change from the audit trail

**Design implications:** the admin console must make risk configuration concrete,
not abstract — a threshold slider should show its real-world effect. The audit
trail must be filterable and complete. Margin floors must be visibly enforced.

## 5.3 Tertiary — Dana, Head of E-commerce

- **Role:** approves the tool's adoption; does not use it daily
- **What she needs:** evidence of impact and evidence of safety
- **Success:** a dashboard she can look at monthly showing response latency and realised margin, and a clean answer if anything goes wrong

**Design implications:** the dashboard home must carry meaningful aggregate stats,
not vanity metrics.

## 5.4 Anti-persona — the fully autonomous agent

Worth stating explicitly. Pricewise is deliberately **not** built for an operator
who wants to hand the model the catalog and walk away. Every design decision that
trades autonomy for legibility — the confidence threshold, the approval queue, the
agent trail, the rule engine that can overrule the model — is made on purpose. A
system that cannot explain itself cannot be trusted with revenue, and a system
that is trusted with revenue and then cannot explain a bad outcome will be
switched off after the first incident.

---

# 6. Jobs to be done

Written in the canonical form, because these drive the screen specs.

| ID | Job story |
|---|---|
| JTBD-1 | When a competitor changes price on a product I own, I want to know within minutes and see a recommended response, so I can act before losing a week of sales |
| JTBD-2 | When I'm given a price recommendation, I want to see what evidence produced it, so I can decide whether to trust it rather than having to take it on faith |
| JTBD-3 | When I have a queue of recommendations, I want to clear the obvious ones fast and spend my attention on the ambiguous ones, so my time goes where judgement is actually needed |
| JTBD-4 | When I disagree with the AI, I want to override it and record why, so the decision is documented and the system has a record to learn from |
| JTBD-5 | When I'm configuring the system, I want to see the real consequence of a threshold before I set it, so I'm not guessing at an abstract number |
| JTBD-6 | When finance asks why a price changed three weeks ago, I want to answer in under a minute with a complete record |
| JTBD-7 | When the system wants to do something that violates our margin policy, I want it to be stopped automatically, not flagged for me to catch |
| JTBD-8 | When my company uses this platform, I want certainty that no other company can see our costs, margins or pricing strategy |

---

# 7. User journeys

## 7.1 Journey A — The competitor undercut (primary happy path)

**Trigger:** a competitor drops the price of a product by 15%.

1. Priya logs in and lands on the dashboard. A stat card reads "4 pending recommendations."
2. She opens the catalog and sees the product flagged with a competitor-price delta chip in red — we are now 15% more expensive than the market.
3. She clicks **Generate recommendation**.
4. The agent pipeline view appears. Market Intelligence and Inventory & Cost start simultaneously; she watches each report in. Demand Forecasting follows, then Pricing Strategy, then Execution & Compliance. Total elapsed: about twelve seconds.
5. The result panel shows: current $329.99 → recommended $294.99, a 10.6% decrease, confidence 0.87, and three sentences of rationale referencing the competitor median and the overstock position.
6. Her organization's threshold is 0.85, so this auto-executed. The panel says so, and the product price is already updated.
7. She expands the Inventory & Cost agent card out of curiosity and sees days-of-cover was 140 — the system priced aggressively partly because the warehouse is full. She agrees.

**Outcome:** a correct price response, six days earlier than the old process, with the reasoning available but not demanded of her.

## 7.2 Journey B — The margin floor blocks the obvious move

**Trigger:** a competitor prices a product below our cost.

1. Priya generates a recommendation on a home-goods SKU where a competitor has gone aggressive.
2. The pipeline runs. Market Intelligence reports a competitor median well below our current price. Demand Forecasting reports elastic demand. Everything points to a large price cut.
3. Inventory & Cost reports an absolute floor price of $41.20 — below which we sell at a loss.
4. Pricing Strategy recommends $41.50, right at the floor, and its rationale says plainly that the competitively-indicated price is below our cost structure and cannot be matched.
5. Execution & Compliance returns `decision: adjust` and explains that MARGIN_FLOOR bound the outcome.
6. Confidence lands at 0.71 — below threshold, because a large delta penalty and an active inventory constraint both fired. It routes to Priya.
7. She reads the confidence waterfall: base 0.86, −0.10 large price change, −0.05 inventory constraint → 0.71. She understands exactly why it came to her.
8. She approves. The price moves to the floor, not below it.

**Outcome:** the system did not do something commercially damaging, and Priya can see precisely why it stopped where it did.

## 7.3 Journey C — The analyst overrides

1. Priya opens a pending recommendation suggesting a 12% cut.
2. The rationale is sound, but she knows something the system does not: this SKU is in a bundle promotion launching Thursday, and cutting the standalone price now undermines the bundle's value.
3. She clicks **Modify**, enters $279.00 instead of the recommended $264.00.
4. The system validates her price against the rule engine — a human may not breach the margin floor either — and accepts it.
5. The audit record stores both numbers: AI recommended $264.00 at 0.82 confidence, human chose $279.00.

**Outcome:** the human's contextual knowledge wins, and the disagreement is captured as data.

## 7.4 Journey D — Admin configures risk posture

1. Marcus opens Settings.
2. He drags the confidence threshold from 0.85 to 0.90. Live preview text updates: "Of your last 20 recommendations, 8 would have auto-executed at this threshold" (down from 14).
3. He sets the Electronics margin floor to 18% because that category's contribution margin is under pressure.
4. Both changes write audit rows with before and after values.
5. The next generation run in Electronics is constrained by the new floor.

**Outcome:** risk posture is a dial he can turn with visible consequences, not a config file someone edits.

## 7.5 Journey E — Two organizations, zero overlap

1. Priya (Suvidha Retail) and Marco (Bazaar Kart) are both logged in.
2. Their catalogs share zero SKUs. Their dashboards show different numbers. Their org names are in their headers.
3. Marco pastes a Suvidha product URL into his browser. He gets a not-found page — not a permission error, because confirming the resource exists would itself be a leak.
4. Bazaar Kart's confidence threshold is 0.75 versus Suvidha's 0.85, so identical market conditions produce different auto-execution behaviour between the two tenants.

**Outcome:** isolation is demonstrable in thirty seconds of screen-sharing.

## 7.6 Journey F — The AI service is unavailable

1. Priya clicks Generate. Groq is rate-limited.
2. The client wrapper retries twice with backoff. Still failing.
3. Market Intelligence fails. The pipeline does not die — Demand Forecasting is skipped with a stated reason, and the remaining agents proceed with what they have.
4. The confidence score absorbs two penalties for the missing agents and lands at 0.41.
5. The recommendation routes to Priya, clearly marked as degraded, with the failed agents visible in the trail.
6. She can retry, or act on the partial analysis, or ignore it.

**Outcome:** partial failure produces a hedged, labelled answer rather than a crash or — worse — a confident answer built on missing data.

---

# 8. Scope

## 8.1 In scope — must have (P0)

Failure to deliver any P0 item means the product does not meet its own premise.

- Email/password authentication with signup, login, logout, session refresh
- Organization creation and invite-based joining
- Two roles with genuinely different permissions
- Tenant-isolated data across every resource
- Product catalog with full CRUD, filtering, search, sorting, pagination
- Five-agent pricing pipeline with real tool calling
- Deterministic confidence scoring with explainable components
- Business rule engine enforcing margin floors and delta limits
- Human approval workflow: approve, reject with reason, modify
- Configurable auto-execution threshold
- Full audit trail
- Recommendation detail view with per-agent contributions
- Live streamed agent progress
- Mock e-commerce execution with failure handling and rollback
- Seeded demo data for two organizations

## 8.2 In scope — should have (P1)

Deliver unless the Day-4 checkpoint says otherwise.

- Dashboard home with aggregate stats and activity feed
- Bulk approve from the queue
- Comparable historical decisions on the detail view
- Confidence waterfall visualisation
- Factor-weight chart
- Per-category margin rules
- Simulate-market-event control for live demonstration
- Live deployment with a working URL
- Docker Compose one-command local setup
- Unit, integration and E2E test suites
- CI pipeline

## 8.3 In scope — nice to have (P2)

Cut first if time runs short.

- Price history chart per product
- Export recommendations to CSV
- Threshold preview calculation
- Member management with role changes
- Audit trail date-range filtering
- Keyboard shortcuts for queue triage

## 8.4 Out of scope

See §3.3. Additionally out of scope for v1: notifications of any kind, saved
views, commenting on recommendations, approval delegation, and any form of
scheduled execution.

---

# 9. Functional requirements

Requirements are identified `FR-<area>-<n>`, carry a priority, and each has at
least one acceptance criterion that is observable without reading code.

## 9.1 Authentication

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-1 | A visitor can create an account, which also creates a new organization with that user as its Admin | P0 |
| FR-AUTH-2 | Passwords must be at least 10 characters and contain lowercase, uppercase and a digit | P0 |
| FR-AUTH-3 | Passwords are stored only as an argon2id hash; the plaintext is never persisted or logged | P0 |
| FR-AUTH-4 | A registered user can log in with email and password | P0 |
| FR-AUTH-5 | Sessions are carried in httpOnly cookies inaccessible to JavaScript | P0 |
| FR-AUTH-6 | An expired access token is refreshed silently without the user noticing | P0 |
| FR-AUTH-7 | Refresh tokens rotate on every use; re-use of a rotated token revokes the entire session chain | P0 |
| FR-AUTH-8 | Logout revokes the refresh token server-side and clears both cookies | P0 |
| FR-AUTH-9 | Failed login attempts are rate-limited per IP and email; successful logins are not counted against the limit | P0 |
| FR-AUTH-10 | Login failure messaging does not reveal whether an email is registered | P0 |
| FR-AUTH-11 | A user can join an existing organization using an invite code issued to their email address | P0 |

**Acceptance criteria**

- AC-AUTH-1: signing up with `alice@x.com` creates exactly one Organization and one User with role ADMIN.
- AC-AUTH-2: `password1` is rejected client-side before any network request, with the reason shown inline.
- AC-AUTH-3: inspecting the database shows a `$argon2id$` prefixed hash and no plaintext column.
- AC-AUTH-5: `document.cookie` in the browser console returns nothing containing the token.
- AC-AUTH-6: with the access token expired, an ordinary page action succeeds; the network tab shows one refresh call followed by a retry of the original request.
- AC-AUTH-7: replaying a previous refresh token returns 401 and the current refresh token also stops working.
- AC-AUTH-9: 11 failed logins in 15 minutes returns 429 with a `Retry-After` header.
- AC-AUTH-10: login with an unregistered email and login with a wrong password produce identical response bodies.
- AC-AUTH-11: redeeming a code issued to `bob@x.com` while registering as `eve@x.com` is rejected.

## 9.2 Organization management

| ID | Requirement | Priority |
|---|---|---|
| FR-ORG-1 | An Admin can view and edit organization settings | P0 |
| FR-ORG-2 | An Admin can set the auto-execution confidence threshold between 0.50 and 1.00 | P0 |
| FR-ORG-3 | An Admin can set a maximum permitted price change percentage | P0 |
| FR-ORG-4 | An Admin can define per-category margin floors and delta limits | P1 |
| FR-ORG-5 | An Admin can generate an invite code bound to an email address and a role | P0 |
| FR-ORG-6 | Invite codes expire after 7 days and are single-use | P0 |
| FR-ORG-7 | Issuing a second invite for the same email supersedes the first | P1 |
| FR-ORG-8 | An Admin can view organization members and their roles | P1 |
| FR-ORG-9 | Every settings change writes an audit record containing both previous and new values | P0 |
| FR-ORG-10 | An Analyst cannot access any organization configuration surface | P0 |

**Acceptance criteria**

- AC-ORG-2: setting the threshold to 0.90 causes a recommendation scoring 0.87 to route for approval rather than auto-execute.
- AC-ORG-6: redeeming the same code twice fails on the second attempt.
- AC-ORG-9: the audit entry for a threshold change shows `{before: 0.85, after: 0.90}`.
- AC-ORG-10: an Analyst navigating directly to `/settings` sees a forbidden page, and the corresponding API call returns 403.

## 9.3 Product catalog

| ID | Requirement | Priority |
|---|---|---|
| FR-CAT-1 | Any authenticated member can view their organization's catalog | P0 |
| FR-CAT-2 | An Admin can create, edit and delete products | P0 |
| FR-CAT-3 | SKUs are unique within an organization but may repeat across organizations | P0 |
| FR-CAT-4 | The catalog is filterable by category and inventory status | P0 |
| FR-CAT-5 | The catalog is searchable by product name and SKU, case-insensitively | P0 |
| FR-CAT-6 | The catalog is sortable by name, price, inventory level and last update | P0 |
| FR-CAT-7 | The catalog is paginated | P0 |
| FR-CAT-8 | Each row shows current price, most recent competitor price with a visual delta, computed margin, inventory level and status, and current recommendation state | P0 |
| FR-CAT-9 | A product whose margin is below its floor is visually flagged | P1 |
| FR-CAT-10 | Filter, sort, search and page state is reflected in the URL | P1 |
| FR-CAT-11 | Product create/edit validates that price exceeds cost | P0 |
| FR-CAT-12 | Inventory status is derived from inventory level, not entered manually | P0 |
| FR-CAT-13 | Any member can trigger recommendation generation for a product | P0 |
| FR-CAT-14 | Any member can simulate a market event against a product for demonstration purposes | P1 |

**Acceptance criteria**

- AC-CAT-3: creating SKU `ABC-1` succeeds in Org A and also succeeds in Org B; a second `ABC-1` in Org A returns 409.
- AC-CAT-8: a product priced above the competitor median shows a red delta chip; below shows green.
- AC-CAT-10: copying the URL after filtering to Electronics and reopening it in a new tab reproduces the same filtered view.
- AC-CAT-11: submitting price 10 and cost 15 shows a validation error attached to the price field.

## 9.4 Recommendation generation

| ID | Requirement | Priority |
|---|---|---|
| FR-GEN-1 | Triggering generation runs the five-agent pipeline for the selected product | P0 |
| FR-GEN-2 | Progress is streamed to the browser, agent by agent, as it happens | P0 |
| FR-GEN-3 | Each agent's start, completion, skip or failure is individually visible | P0 |
| FR-GEN-4 | On completion, the user sees the recommended price, the delta from current, the confidence score, and the rationale | P0 |
| FR-GEN-5 | If confidence meets or exceeds the organization threshold, the change executes automatically and the UI says so | P0 |
| FR-GEN-6 | If confidence is below the threshold, the recommendation enters the approval queue | P0 |
| FR-GEN-7 | A recommendation blocked by the rule engine always routes to a human regardless of confidence | P0 |
| FR-GEN-8 | If the client disconnects mid-run, the pipeline completes server-side and the result is retrievable | P0 |
| FR-GEN-9 | Every agent invocation is persisted with its input, output, duration, token usage and any error | P0 |
| FR-GEN-10 | A failed non-critical agent degrades the pipeline rather than aborting it | P0 |
| FR-GEN-11 | A failed critical agent (Inventory & Cost, Pricing Strategy) aborts the run and persists a FAILED recommendation | P0 |

**Acceptance criteria**

- AC-GEN-2: the browser network tab shows progressive `text/event-stream` frames, not a single response at the end.
- AC-GEN-5: with a threshold of 0.75 and a confidence of 0.82, the product's price changes without further input and the panel reads "Auto-executed."
- AC-GEN-8: closing the tab ten seconds into a run and reopening the product shows a completed recommendation.
- AC-GEN-9: the detail view shows five agent cards, each with a duration in milliseconds.
- AC-GEN-10: forcing the Market Intelligence agent to fail produces a completed recommendation with Demand Forecasting marked skipped and two penalties applied.

## 9.5 Approval workflow

| ID | Requirement | Priority |
|---|---|---|
| FR-APR-1 | Pending recommendations appear in a queue sorted by confidence descending by default | P0 |
| FR-APR-2 | The queue is filterable by status and by product | P0 |
| FR-APR-3 | A user can approve a pending recommendation, which executes the price change | P0 |
| FR-APR-4 | A user can reject a pending recommendation with a mandatory reason | P0 |
| FR-APR-5 | A user can modify the recommended price and execute their own value | P0 |
| FR-APR-6 | A human-entered price is validated against the same rule engine as an AI-generated one | P0 |
| FR-APR-7 | Resolved recommendations are terminal — they cannot be re-actioned | P0 |
| FR-APR-8 | Every action records who acted, when, and what changed | P0 |
| FR-APR-9 | A modification records both the AI's price and the human's price | P0 |
| FR-APR-10 | A user can approve multiple recommendations in one interaction | P1 |
| FR-APR-11 | Queue actions update the UI immediately, reverting with an explanation on failure | P1 |
| FR-APR-12 | Rejection reasons surface on future recommendations for the same product | P1 |

**Acceptance criteria**

- AC-APR-3: approving changes the product's `currentPrice` to the recommended value and writes a `PriceExecution` row.
- AC-APR-4: submitting a rejection with an empty reason is blocked in the UI and returns 422 from the API.
- AC-APR-6: modifying to a price below the margin floor returns 422 with the violated rule named.
- AC-APR-7: approving an already-approved recommendation returns 409.
- AC-APR-9: the audit entry contains both `aiRecommendedPrice` and `humanChosenPrice`.

## 9.6 Explainability

| ID | Requirement | Priority |
|---|---|---|
| FR-EXP-1 | The detail view shows each agent's contribution separately | P0 |
| FR-EXP-2 | Each agent card shows its self-reported confidence | P0 |
| FR-EXP-3 | Each agent card lists the tools it called and with what arguments | P0 |
| FR-EXP-4 | The raw JSON output of each agent is viewable on demand | P0 |
| FR-EXP-5 | The confidence score is broken down into its base value and each named penalty | P1 |
| FR-EXP-6 | The relative weight of each decision factor is shown visually | P1 |
| FR-EXP-7 | Comparable past decisions for the same product are shown, including rejection reasons | P1 |
| FR-EXP-8 | Execution attempts, including failures and rollbacks, are shown with timestamps | P0 |
| FR-EXP-9 | Every displayed figure traces to a stored value; nothing is recomputed client-side in a way that could diverge from the backend | P0 |

**Acceptance criteria**

- AC-EXP-3: the Market Intelligence card shows `get_competitor_prices({lookbackDays: 7})`.
- AC-EXP-5: the waterfall's deductions sum exactly to base minus final.
- AC-EXP-6: the four factor weights sum to 1.0 within rounding tolerance.

## 9.7 Audit trail

| ID | Requirement | Priority |
|---|---|---|
| FR-AUD-1 | Every state-changing operation writes exactly one audit record | P0 |
| FR-AUD-2 | Records capture actor (or system), action, entity, before value, after value and timestamp | P0 |
| FR-AUD-3 | Audit records cannot be edited or deleted through any interface | P0 |
| FR-AUD-4 | The trail is filterable by entity type, action and actor | P0 |
| FR-AUD-5 | The trail is filterable by date range | P2 |
| FR-AUD-6 | The trail is paginated for unbounded growth | P0 |
| FR-AUD-7 | An audit write failure is logged loudly but does not roll back the operation it describes | P0 |
| FR-AUD-8 | Auto-executed changes are attributed to the system, distinguishable from human actions | P0 |

**Acceptance criteria**

- AC-AUD-1: approving a recommendation produces exactly one `RECOMMENDATION_APPROVED` entry — not zero, not two.
- AC-AUD-3: no API route exists that accepts a PATCH or DELETE against an audit record.
- AC-AUD-8: an auto-executed change has a null `userId` and action `PRICE_AUTO_EXECUTED`.

## 9.8 Execution and rollback

| ID | Requirement | Priority |
|---|---|---|
| FR-EXE-1 | An approved price is pushed to the e-commerce platform API | P0 |
| FR-EXE-2 | A final deterministic rule check runs immediately before execution, independent of any agent's approval | P0 |
| FR-EXE-3 | A failed platform push rolls the local price back to its prior value | P0 |
| FR-EXE-4 | Every execution attempt, successful or not, is recorded | P0 |
| FR-EXE-5 | A failed auto-execution demotes the recommendation to pending rather than losing it | P0 |
| FR-EXE-6 | The user is told clearly when an execution failed and that the price was reverted | P0 |

**Acceptance criteria**

- AC-EXE-2: a manually crafted request to execute a below-floor price is rejected even though no agent objected.
- AC-EXE-3: with the platform forced to fail, the product's price after the attempt equals its price before, and a `PriceExecution` row shows `rolledBack: true`.

---
# 10. AI product requirements

This section specifies what the AI must *do as a product feature*, not how it is
implemented. How it was built is described in `ARCHITECTURE.md` section 4.

## 10.1 Why five agents rather than one prompt

A single prompt containing competitor prices, inventory, cost, demand signals and
business rules would produce an answer. It would fail the product's actual
requirements for four reasons:

1. **No separable reasoning.** When the answer is wrong, there is no way to tell
   which part of the reasoning failed. With specialist agents, a bad
   recommendation traces to a specific agent's specific output.
2. **No partial availability.** If competitor data is missing, a monolithic prompt
   either hallucinates around the gap or refuses entirely. Separate agents let the
   system lose one input and continue with a hedged, labelled result.
3. **No meaningful confidence.** A single model's self-reported confidence is one
   unreproducible number. Four narrow confidences combined arithmetically produce
   a score that is both reproducible and decomposable.
4. **No enforcement boundary.** Business rules evaluated inside the same prompt
   that generates the price can be reasoned around. A separate compliance stage
   with a deterministic rule engine behind it cannot be talked out of a margin
   floor.

## 10.2 Agent responsibilities

| Agent | Owns | Must not do | Tools |
|---|---|---|---|
| Market Intelligence | Where we sit versus competitors, and which way that is moving | Recommend a price; consider cost or stock | `get_competitor_prices`, `get_price_history` |
| Inventory & Cost | Hard constraints: floor price, stock position, days of cover | Recommend a price; consider competitors | `get_inventory_and_cost` |
| Demand Forecasting | How volume responds to a price change | Recommend a price; override market findings | `get_demand_trends` |
| Pricing Strategy | Synthesis into one recommended price with rationale and factor weights | Re-fetch data; exceed stated constraints | none — pure synthesis |
| Execution & Compliance | Validating against rules and executing or routing | Overrule a blocking violation | `update_ecommerce_price` |

**Requirement AI-1:** each agent's output schema must contain no field outside its
responsibility. An agent that cannot express an out-of-scope opinion cannot have
one.

**Requirement AI-2:** agents are given only the tools their responsibility
requires. The Market Intelligence agent has no inventory tool and therefore
physically cannot reason from stock levels.

## 10.3 Execution model

**Requirement AI-3:** Market Intelligence and Inventory & Cost have no dependency
on each other and must run concurrently.

**Requirement AI-4:** Demand Forecasting receives Market Intelligence's validated
output, including its confidence. If upstream confidence is below 0.5, downstream
confidence must be capped.

**Requirement AI-5:** Pricing Strategy receives all three upstream outputs plus the
organization's constraints, and produces a price within the permitted range.

**Requirement AI-6:** Execution & Compliance receives the strategy output plus the
deterministic rule engine's findings, and produces a decision of allow, adjust or
block.

## 10.4 Tool calling

**Requirement AI-7:** the model decides which tools to call. The orchestrator must
not pre-fetch all data and inject it. An agent that needs only a snapshot must be
able to skip the history call.

**Requirement AI-8:** tools return `{ available: false, reason }` when data is
absent rather than throwing, so the model can reason about the gap explicitly.

**Requirement AI-9:** multiple tools requested in one round execute concurrently.

**Requirement AI-10:** tool arguments are validated before execution. A malformed
argument is returned to the model as an error it can correct, not a crash.

## 10.5 Output contracts

**Requirement AI-11:** every agent hand-off is a schema-validated object. Agents
never pass prose to each other.

**Requirement AI-12:** a schema validation failure triggers exactly one repair
attempt in which the model is shown its own validation error. A second failure
fails the agent.

**Requirement AI-13:** output parsing must tolerate markdown fences and leading
prose, since models produce both despite instruction.

## 10.6 Arithmetic

**Requirement AI-14:** the LLM supplies judgement; code supplies arithmetic.
Specifically, the following are computed in code and never derived by a model:

- absolute floor price from cost and margin floor
- percentage delta between current and recommended price
- the final confidence score
- margin at any proposed price
- whether a rule is violated

**Requirement AI-15:** where a computed value is given to an agent (such as floor
price), the prompt must instruct the agent to pass it through unchanged, and the
value must be re-verified in code afterward.

**Requirement AI-16:** if an agent returns a price outside the permitted range, the
system clamps it and reduces that recommendation's confidence, on the basis that
an agent which ignored a stated constraint has demonstrated unreliability on this
case.

## 10.7 Confidence model

**Requirement AI-17:** the confidence score is a deterministic function. The same
agent outputs must always produce the same score.

**Requirement AI-18:** base confidence is a weighted mean of agent self-reported
confidences — market 0.30, demand 0.25, inventory 0.25, strategy 0.20 —
redistributed across agents that actually produced output.

**Requirement AI-19:** penalties are named, individually visible, and deducted
from the base:

| Penalty | Amount | Condition |
|---|---|---|
| Stale competitor data | 0.15 | Oldest observation older than 7 days |
| Conflicting signals | 0.10 | Market trend and demand trend oppose |
| Missing agent | 0.20 each | An agent failed or was skipped |
| Large price change | 0.10 | Absolute delta exceeds 15% |
| Active inventory constraints | 0.05 | One or more constraints flagged |

**Requirement AI-20:** the breakdown is persisted with the recommendation and
rendered in the UI. A user must be able to see *why* a score is what it is, not
just what it is.

## 10.8 Resilience

**Requirement AI-21:** each agent call times out after 30 seconds.

**Requirement AI-22:** rate-limit and server errors are retried twice with
exponential backoff and jitter.

**Requirement AI-23:** a tool failure is reported to the model as data, not raised.

**Requirement AI-24:** loss of a non-critical agent degrades the result. Loss of a
critical agent (Inventory & Cost, Pricing Strategy) aborts the run with a
persisted FAILED record.

**Requirement AI-25:** the application must remain fully usable — catalog, queue,
audit, settings — when the LLM provider is entirely unavailable. Only generation
is affected.

## 10.9 Prompt design requirements

**Requirement AI-26:** system prompts carry role, scope boundaries, method,
calibration guidance and output format. User prompts carry only facts about the
specific case. This separation keeps instructions consistent across runs.

**Requirement AI-27:** where a model is known to be inconsistent — price
elasticity magnitude, for instance — the system prompt provides explicit anchors
per category rather than leaving the scale to the model.

**Requirement AI-28:** temperature is set low (0.2). This is analysis, not
creative writing; run-to-run variance is a defect here, not a feature.

**Requirement AI-29:** rationale text must reference specific figures from the
agent reports and must not use phrasing that attributes agency to the system
("the AI recommends"). It states the business case.

---

# 11. Trust, explainability and human agency

This section exists because it is the product's actual differentiator, and
because "why would a business let an AI change prices?" is the first question any
evaluator or customer will ask.

## 11.1 The trust ladder

The product is designed so an organization can move along this ladder at its own
pace, without a code change:

| Threshold | Behaviour | Who it suits |
|---|---|---|
| 1.00 | Nothing auto-executes; every recommendation is reviewed | A team trying the system for the first time |
| 0.90 | Only near-certain, low-delta changes execute | A team that has watched it for a few weeks |
| 0.85 | Default. Roughly half auto-execute | Steady state |
| 0.75 | Most execute; humans see the ambiguous cases | A confident team with good data coverage |
| 0.50 | Almost everything executes | Not recommended; effectively full autonomy |

The threshold is the single dial that converts "how much do we trust this yet"
into system behaviour. That it is org-scoped rather than global is deliberate —
two tenants on the same deployment can sit at different rungs.

## 11.2 What "explainable" means here

**It is not:** a paragraph of model-generated text explaining itself. A model's
explanation of its own reasoning is a post-hoc narrative, not evidence.

**It is:** structured provenance. For any recommendation a user can see —

- which specialist agent produced each finding, and that agent's own confidence
- which tools were called, with which arguments, and how long they took
- the actual data those tools returned
- how the final confidence was assembled, penalty by named penalty
- how much each factor weighed in the decision
- what the rule engine found
- what happened last time this product's price was touched, and why anyone
  disagreed

**Requirement TR-1:** the explainability surface must be reachable in one click
from the queue, and readable without scrolling past the fold for the key facts.

**Requirement TR-2:** no explanation may be generated at render time. Everything
shown was computed and stored when the recommendation was produced, so what a user
sees is what actually happened, not a reconstruction.

## 11.3 Human agency guarantees

**Requirement TR-3:** a human may always override the AI's price, subject to the
same rule engine.

**Requirement TR-4:** a human may always reject, and the reason is recorded and
resurfaced.

**Requirement TR-5:** nothing auto-executes that the rule engine blocked,
regardless of confidence.

**Requirement TR-6:** auto-execution is opt-in via a threshold an Admin sets
explicitly. There is no default state in which the system acts without that
having been configured.

**Requirement TR-7:** every automated action is attributed to the system in the
audit trail and is distinguishable at a glance from a human action.

## 11.4 The feedback loop

Every modification stores the AI's price alongside the human's. Every rejection
stores a reason. This is not used to retrain anything in v1 — it is captured
because it is the only honest basis on which anyone could later ask "are these
recommendations actually good?", and that question cannot be answered
retroactively if the data was never recorded.

**Requirement TR-8:** the AI-versus-human price delta must be queryable per
product, per category and per time period, even though no v1 screen surfaces it.

---

# 12. Multi-tenancy and access control

## 12.1 Tenancy model

Shared database, shared schema, `organizationId` discriminator. Chosen over
schema-per-tenant because migration complexity across N schemas is not justified
at this scale, and the isolation property is achievable without it.

**Requirement MT-1:** every tenant-owned record carries an organization
identifier.

**Requirement MT-2:** the acting organization is derived exclusively from the
verified session token. A client-supplied organization identifier in a body or
query string is ignored and its presence logged.

**Requirement MT-3:** every database query touching tenant-owned data filters on
the organization identifier.

**Requirement MT-4:** a request for a resource belonging to another organization
returns *not found*, never *forbidden*. Confirming existence is itself a leak.

**Requirement MT-5:** uniqueness constraints are scoped per tenant. Two
organizations may use the same SKU.

**Requirement MT-6:** tenant isolation is verified by automated test for every
resource type and every operation.

## 12.2 Defence in depth

Four independent layers, any one of which would prevent a leak:

| Layer | Mechanism | Fails how |
|---|---|---|
| 1 | Organization id read only from the signed token | Requires forging a signed JWT |
| 2 | Service functions require the id as a typed positional parameter | Omitting it is a compile error |
| 3 | Integration test matrix covering every resource and operation | CI blocks the merge |
| 4 | Postgres row-level security on the highest-risk tables | Database refuses the row |

## 12.3 Roles

| Capability | Admin | Pricing Analyst |
|---|---|---|
| View catalog | ✓ | ✓ |
| Create / edit / delete products | ✓ | — |
| Generate recommendations | ✓ | ✓ |
| View recommendation detail and agent trail | ✓ | ✓ |
| Approve / reject / modify | ✓ | ✓ |
| Configure confidence threshold | ✓ | — |
| Configure margin floors | ✓ | — |
| Invite users and assign roles | ✓ | — |
| View audit trail | ✓ | ✓ |
| Simulate market event | ✓ | ✓ |

**Requirement MT-7:** role checks are enforced server-side on every protected
route. Client-side role logic exists only to avoid showing a control that would
fail, and is never the enforcement mechanism.

**Requirement MT-8:** the first user of a new organization is always an Admin,
since an organization with no administrator is unadministrable.

---

# 13. Non-functional requirements

## 13.1 Performance

| ID | Requirement | Target |
|---|---|---|
| NFR-P1 | Catalog page interactive | < 1.5s on a warm cache |
| NFR-P2 | API response for list endpoints | < 300ms p95 |
| NFR-P3 | First agent event appears after triggering generation | < 2s |
| NFR-P4 | Full five-agent pipeline | < 25s p95 |
| NFR-P5 | No N+1 queries on any list view | zero |
| NFR-P6 | Catalog list supports 500+ products without pagination degradation | verified |

## 13.2 Reliability

| ID | Requirement |
|---|---|
| NFR-R1 | The application remains usable when the LLM provider is unavailable |
| NFR-R2 | No data loss on client disconnect during generation |
| NFR-R3 | A failed platform execution never leaves the local price inconsistent with the platform |
| NFR-R4 | Data survives server restart (no in-memory state of record) |
| NFR-R5 | A health endpoint reports database and dependency status |

## 13.3 Security

| ID | Requirement |
|---|---|
| NFR-S1 | Passwords hashed with argon2id at OWASP-minimum parameters |
| NFR-S2 | Tokens in httpOnly cookies, never in local storage |
| NFR-S3 | Separate signing secrets for access and refresh tokens |
| NFR-S4 | Refresh token rotation with reuse detection |
| NFR-S5 | Security headers applied via helmet |
| NFR-S6 | CORS restricted to an exact origin; no wildcard with credentials |
| NFR-S7 | CSRF mitigated by a custom header that cross-site forms cannot set |
| NFR-S8 | Rate limiting on authentication and general API routes |
| NFR-S9 | All input validated server-side; client validation is UX only |
| NFR-S10 | No secret ever reaches the client bundle |
| NFR-S11 | No stack trace in any client-facing error response |
| NFR-S12 | Errors carry a correlation id linking to server logs |
| NFR-S13 | Request body size bounded |
| NFR-S14 | No password, token or cookie value is ever logged |

## 13.4 Usability

| ID | Requirement |
|---|---|
| NFR-U1 | Every asynchronous surface has an explicit loading state |
| NFR-U2 | Every collection has a distinct empty state, differentiating "nothing yet" from "nothing matches your filter" |
| NFR-U3 | Every error state offers a recovery action |
| NFR-U4 | Destructive actions require confirmation |
| NFR-U5 | Currency is formatted consistently and never shown as a raw float |
| NFR-U6 | Relative timestamps for recency, absolute on hover |
| NFR-U7 | Full desktop support at 1280px and above; usable at tablet width |

## 13.5 Accessibility

| ID | Requirement |
|---|---|
| NFR-A1 | All interactive elements reachable by keyboard |
| NFR-A2 | Visible focus indicators |
| NFR-A3 | Text contrast meets WCAG AA |
| NFR-A4 | Status is never conveyed by colour alone — confidence badges carry a number, delta chips carry an arrow |
| NFR-A5 | Form errors programmatically associated with their inputs |
| NFR-A6 | Live agent progress announced to assistive technology via a polite live region |
| NFR-A7 | Animation respects reduced-motion preference |

## 13.6 Maintainability

| ID | Requirement |
|---|---|
| NFR-M1 | Strict TypeScript across all packages |
| NFR-M2 | Single-direction layering: route → controller → service → repository |
| NFR-M3 | Database access confined to the repository layer, enforced by lint rule |
| NFR-M4 | Validation schemas defined once and shared between client, server and API contract |
| NFR-M5 | Structured logging with request correlation |
| NFR-M6 | Environment validated at boot; misconfiguration fails fast |
| NFR-M7 | Meaningful commit history documenting the build |

## 13.7 Observability

| ID | Requirement |
|---|---|
| NFR-O1 | Every request logged with correlation id, route, status and duration |
| NFR-O2 | Every agent run logged with agent name, duration and token usage |
| NFR-O3 | Token usage persisted per agent run for cost attribution |
| NFR-O4 | Rate limits, retries and tool failures logged at warn level |
| NFR-O5 | Health endpoint exposes dependency status and build version |

---

# 14. Information architecture

```
/login                              public
/signup                             public
/join                               public — invite redemption

/                                   Dashboard
/products                           Catalog
/products/:id                       Product detail + generation
/recommendations                    Approval queue
/recommendations/:id                Recommendation detail + explainability
/audit                              Audit trail
/settings                           Admin only — org configuration
/settings/members                   Admin only — members and invites
```

Navigation is a persistent left sidebar. The Settings entry is absent for
Analysts. The organization name sits in the header — deliberately prominent,
because it is the visual cue that makes a two-tenant demonstration legible.

---

# 15. Screen specifications

## 15.1 Login

**Purpose:** authenticate, and get an evaluator into the product in one click.

**Contents**
- Email and password fields with inline validation
- Submit with a pending state
- Link to signup and to invite redemption
- **Demo accounts card** listing the four seeded logins; clicking one fills the form

**States**
- Idle, submitting, error (invalid credentials, rate limited, network)

**Notes**
- The demo card is a deliberate evaluation-experience decision. The brief says the
  evaluator should see data immediately; making them find credentials in a README
  is avoidable friction.

## 15.2 Dashboard

**Purpose:** orientation and a route into the day's work.

**Contents**
- Four stat cards: pending recommendations, auto-executed this week, average
  confidence, estimated margin impact of approved changes
- Price-change activity chart over 30 days
- Recent activity list drawn from the audit trail
- Quick actions: review queue, generate, simulate market event
- Organization name in the header

**States**
- Each widget independently skeletoned, empty-stated and error-stated
- Fresh organization with no data shows a first-run state pointing at the seed
  command or at adding a product

## 15.3 Product catalog

**Purpose:** the analyst's index of everything they own.

**Table columns**

| Column | Presentation |
|---|---|
| SKU | Monospace |
| Name | Truncated with tooltip |
| Category | Badge |
| Current price | Right-aligned currency |
| Competitor price | Latest value plus a delta chip with arrow and percentage |
| Margin | Percentage, warning icon if below floor |
| Inventory | Count plus status badge |
| Recommendation | Badge: none / pending with confidence / approved / auto-executed |
| Actions | Generate, Simulate, Edit (Admin), Delete (Admin) |

**Controls**
- Category filter, inventory status filter, free-text search, column sort,
  pagination — all reflected in the URL

**States**
- Loading: skeleton rows matching real column widths so layout does not shift
- Empty (no products): explains how to seed or add
- Empty (no matches): offers to clear filters
- Error: inline retry with the server's message

## 15.4 Agent pipeline view

**Purpose:** the screen that makes the architecture visible. The single best
artefact in a live demo.

**Contents**
- Five agent cards in pipeline order
- The two concurrent agents visually grouped to show parallelism
- Per-card state: pending → running (pulse + elapsed timer) → done / skipped / failed
- On completion, a one-line summary of that agent's headline finding, expandable
  to tools called, arguments, duration, tokens and raw JSON
- Result panel: current → recommended price with delta, confidence with
  threshold reference, rationale, and the outcome (auto-executed / sent for
  approval / blocked)

**States**
- Idle, streaming, complete, partially degraded (skipped agents visible), failed
- Reconnection: navigating away and back shows the completed result

**Accessibility**
- Progress announced via a polite live region
- Pulse animation suppressed under reduced-motion

## 15.5 Approval queue

**Purpose:** high-throughput triage.

**Row contents**
- Product name and SKU
- Current → recommended price with arrow and percentage
- Confidence badge, colour-banded *and* numeric
- Rationale excerpt, one line
- Age
- Actions: approve, reject, view

**Controls**
- Status filter, product filter, sort (confidence default, descending), select-all
  checkbox with bulk approve

**Behaviour**
- Approve is optimistic: the row leaves immediately and returns with an
  explanation if the server rejects
- Reject opens a dialog with a mandatory minimum-length reason
- Bulk approve shows progress and a completion summary

**States**
- Loading, empty ("nothing waiting on you"), error

## 15.6 Recommendation detail

**Purpose:** the justification surface. Where trust is won or lost.

**Layout, top to bottom**

1. **Header** — product, current → recommended, delta, status badge, actions
   (absent when terminal)
2. **Rationale** — the strategy agent's prose, given prominence; this is what a
   human reads first
3. **Factor weights** — visual breakdown of competitor pressure, demand,
   inventory position, margin protection
4. **Confidence waterfall** — base score, each named penalty as a labelled
   deduction, final score, with the organization threshold drawn as a reference
   line
5. **Agent trail** — five expandable cards as described in 15.4
6. **Comparable decisions** — past outcomes for this product with reasons
7. **Execution history** — every attempt, success or rollback, timestamped

**States**
- Pending (actions available), terminal (resolver and timestamp shown, actions
  hidden), failed (failing agent and reason shown, retry offered)

## 15.7 Admin settings

**Purpose:** make risk posture tangible.

**Contents**
- Confidence threshold slider, 0.50–1.00, with live preview: *"Of your last 20
  recommendations, N would have auto-executed at this threshold"*
- Maximum price change percentage
- Per-category margin floors and delta limits, inline editable
- Invite issuance with a copyable code, plus outstanding invites
- Members list with roles

**States**
- Analyst reaching this route sees a forbidden page, not a blank screen
- Save states: idle, saving, saved confirmation, error

## 15.8 Audit trail

**Purpose:** the answer to "what happened and who did it."

**Contents**
- Chronological table: timestamp, actor (or "System"), action, entity, and a
  before/after diff on expand
- Filters: entity type, action, actor, date range
- Cursor pagination

**States**
- Loading, empty, error. No edit or delete controls exist anywhere on this screen.

---

# 16. Data requirements

## 16.1 Entities

| Entity | Purpose | Tenant-owned |
|---|---|---|
| Organization | The tenant | is the tenant |
| User | A member, with a role | ✓ |
| RefreshToken | Session continuity with rotation chain | via User |
| Invite | Joining flow | ✓ |
| Product | A SKU with price, cost, margin floor, inventory | ✓ |
| CategoryRule | Per-category margin and delta limits | ✓ |
| CompetitorPrice | Observed competitor pricing over time | via Product |
| DemandSignal | Seasonal, category and velocity signals | via Product |
| PricingRecommendation | A produced recommendation with status | ✓ |
| AgentRun | One agent's invocation record | via Recommendation |
| PriceExecution | One attempt to push a price, successful or not | via Recommendation |
| AuditLog | Immutable record of state changes | ✓ |

## 16.2 Data rules

**Requirement D-1:** monetary values use fixed-point decimal, never floating
point. A rounding error in a pricing product is not an acceptable class of bug.

**Requirement D-2:** inventory status is derived from inventory level, never
stored independently, so the two cannot disagree.

**Requirement D-3:** agent inputs and outputs are stored as JSON documents rather
than typed columns, because agent output shapes differ per agent and will evolve
faster than a migration cadence.

**Requirement D-4:** recommendation status transitions are constrained. Terminal
states are terminal.

**Requirement D-5:** audit records are append-only by construction — no update or
delete path exists.

**Requirement D-6:** price execution history is one-to-many against a
recommendation, because an execution can fail, roll back and be retried.

## 16.3 Seed data requirements

**Requirement D-7:** the seed produces two organizations with different
categories, different confidence thresholds and zero SKU overlap, so tenant
isolation is visible on sight.

**Requirement D-8:** four users — an Admin and an Analyst per organization — with
a documented shared password.

**Requirement D-9:** roughly 25–30 products per organization across 3–4 categories,
generated with category-aware price ranges, margins and volatility rather than
uniform noise.

**Requirement D-10:** 30 days of competitor price history per product, generated
as a mean-reverting random walk with occasional promotional shocks.

**Requirement D-11:** pre-seeded recommendations across all statuses so the queue,
dashboard and detail views are populated on first login without spending LLM
calls.

**Requirement D-12:** five *planted scenarios* — specific SKUs deliberately placed
in states that exercise distinct code paths:

| SKU pattern | Scenario | What it demonstrates |
|---|---|---|
| Electronics, overstocked, competitor −15% | Aggressive undercut | High-confidence decrease, auto-execution |
| Home, competitor below our cost | Floor binds | Compliance agent adjusts; margin protection visible |
| Apparel, demand spike, stock 11 | Scarcity | Price *increase* recommendation |
| Outdoor, competitor data 19 days old | Stale data | Confidence penalty routes it to a human |
| Beauty, competitor −10% but demand +80% | Conflicting signals | Disagreement penalty; agents visibly diverge |

These are documented in the README so an evaluator knows what to click.

---

# 17. Edge cases and error states

| # | Situation | Expected behaviour |
|---|---|---|
| 1 | LLM provider rate-limited | Retry twice with backoff; then fail that agent gracefully |
| 2 | LLM provider entirely down | Generation unavailable with a clear message; every other feature works |
| 3 | Agent returns malformed JSON | One repair attempt showing the validation error; then fail that agent |
| 4 | Agent returns a price outside bounds | Clamp to the bound, reduce confidence, log |
| 5 | Competitor data absent entirely | Tool reports unavailable; agent reports low confidence; no fabricated numbers |
| 6 | Competitor data stale | Penalty applied and named in the waterfall |
| 7 | All agents low confidence | Recommendation routes to human regardless of threshold |
| 8 | Rule engine blocks the recommendation | Never auto-executes; goes to human with the violated rule named |
| 9 | Human modifies below the floor | Rejected with the rule named; the human is not exempt |
| 10 | Platform API fails on execute | Local price rolled back; failure recorded; user told |
| 11 | Auto-execution fails at the platform | Demoted to pending rather than lost |
| 12 | Client disconnects mid-stream | Pipeline completes server-side; result retrievable |
| 13 | Two analysts approve the same recommendation simultaneously | Second attempt returns conflict; no double execution |
| 14 | Access token expires mid-session | Silent refresh; user notices nothing |
| 15 | Refresh token reused | Entire session chain revoked; re-login required |
| 16 | Invite code expired | Clear message distinguishing expired from invalid |
| 17 | Invite redeemed with the wrong email | Rejected |
| 18 | Duplicate SKU within an organization | Conflict with a clear message |
| 19 | Same SKU in a different organization | Permitted |
| 20 | Product deleted while a recommendation is pending | Cascade deletes the recommendation; audit retains the record |
| 21 | Empty catalog | First-run empty state distinct from a no-matches empty state |
| 22 | Analyst navigates directly to an admin route | Forbidden page; API returns 403 independently |
| 23 | Organization A requests Organization B's resource by id | Not found, not forbidden |
| 24 | Zero or negative price submitted | Validation error before it reaches the database |
| 25 | Cost exceeds price on product creation | Validation error on the price field |
| 26 | Network drops mid-approval | Optimistic update reverts with an explanation |
| 27 | Audit write fails | Logged at error level; the operation it describes still succeeds |
| 28 | Very long product name | Truncated with tooltip; no layout break |
| 29 | Confidence exactly equals the threshold | Auto-executes — the boundary is inclusive, documented |
| 30 | Recommendation generated for a product with no competitor data at all | Completes with low confidence and an explicit note; does not fail |

---

# 18. Analytics and instrumentation

Not a user-facing analytics product, but the following are captured because they
answer questions that cannot be answered retroactively.

| Event | Properties | Why |
|---|---|---|
| `recommendation_generated` | productId, confidence, deltaPct, autoExecuted, durationMs, totalTokens | Core funnel and cost attribution |
| `agent_completed` | agent, durationMs, promptTokens, completionTokens, confidence | Per-agent cost and latency; identifies the slow one |
| `agent_failed` | agent, errorCode, willRetry | Reliability tracking |
| `recommendation_approved` | recommendationId, confidence, timeToDecisionMs | Trust calibration — are high-confidence ones approved faster? |
| `recommendation_rejected` | recommendationId, confidence, reasonLength | Failure analysis |
| `recommendation_modified` | recommendationId, aiPrice, humanPrice, deltaPct | **The model-quality signal** |
| `execution_failed` | recommendationId, rolledBack | Reliability |
| `threshold_changed` | before, after | Trust ladder movement |

**Requirement AN-1:** token usage is persisted per agent run, so cost per
recommendation is computable rather than estimated.

**Requirement AN-2:** the AI-versus-human price delta is retained indefinitely.
It is the only honest basis for later evaluating recommendation quality.

---

# 19. Cost model

The assessment email names cost as one of three evaluation parameters, so it gets
a real answer rather than a hand-wave.

## 19.1 Cost of the submitted system

| Component | Tier | Cost |
|---|---|---|
| LLM inference (Groq) | Free tier | $0 |
| API hosting (Render) | Free web service | $0 |
| Database (Supabase) | Free tier | $0 |
| Frontend hosting (Vercel) | Hobby | $0 |
| **Total** | | **$0** |

## 19.2 Token economics

A full five-agent pipeline run consumes approximately:

| Agent | Prompt | Completion | Notes |
|---|---|---|---|
| Market Intelligence | ~1,200 | ~350 | Includes one or two tool round-trips |
| Inventory & Cost | ~900 | ~300 | Single tool call |
| Demand Forecasting | ~1,400 | ~350 | Carries upstream output in its prompt |
| Pricing Strategy | ~2,200 | ~500 | Largest prompt — carries all three upstream outputs |
| Execution & Compliance | ~1,100 | ~250 | Carries rule engine findings |
| **Total** | **~6,800** | **~1,750** | ≈ 8,500 tokens per recommendation |

## 19.3 Scaling arithmetic

| Scenario | Recommendations/month | Tokens/month |
|---|---|---|
| Demo usage | ~200 | 1.7M |
| 500 SKUs, weekly repricing | 2,000 | 17M |
| 500 SKUs, daily repricing | 15,000 | 127M |
| 5,000 SKUs, daily repricing | 150,000 | 1.27B |

At commodity inference pricing, the daily-repricing-at-500-SKUs case lands in the
low tens of dollars per month — trivially justified against 8–12% revenue leakage
on a mid-size catalog. The 5,000-SKU case is where architecture starts to matter,
which is why the design already points at the right answers:

**Requirement C-1:** recommendations are generated per-SKU on demand rather than
swept across the catalog on a schedule, so cost tracks actual need.

**Requirement C-2:** the two mechanical agents use a smaller, cheaper model; only
synthesis and compliance use the stronger one. Roughly half the pipeline's tokens
run on the cheaper tier.

**Future levers, documented not built:**
- Skip the pipeline entirely when no input has materially changed since the last
  run — most SKUs on most days need no recommendation
- Cache Market Intelligence output per category per day, since competitor data
  refreshes at a coarser granularity than individual SKUs
- Batch low-value SKUs into a single agent call
- Use the full pipeline only where the price delta is material enough to matter

---

# 20. Release plan

| Milestone | Contents | Day |
|---|---|---|
| M1 — Foundations | Repo, CI, schema, auth with rotation, middleware chain | 1–2 |
| M2 — Product surface | Orgs, invites, catalog CRUD, seed data, frontend shell, auth pages, catalog UI | 2–3 |
| M3 — The pipeline | Groq client, tools, five agents, orchestrator, SSE, live agent UI | 3–4 |
| M4 — The workflow | Queue, detail, explainability, admin console, dashboard, audit | 5 |
| M5 — Ship | E2E, full CI, deployment, README, ARCHITECTURE, DECISIONS, deck | 5 |

**Checkpoint at end of Day 4:** the pipeline must work end to end. If it does not,
cut from M4 (bulk approve, comparable decisions, dashboard charts) rather than
from testing, deployment or documentation. A working app with fewer features beats
a broken app with more — the brief says this in as many words.

---

# 21. Risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | LLM rate limits during development | High | Medium | Cache agent responses by input hash in dev; pre-seed AgentRuns so the explainability UI can be built without live calls |
| 2 | Model output unparseable | High | Medium | Fence stripping, brace extraction, one repair retry — all specified |
| 3 | Cross-site cookies fail in production | Medium | High | Test deployed auth on Day 4, not Day 5; `SameSite=None; Secure` as documented fallback |
| 4 | SSE buffered by the hosting proxy | Medium | High | Disable proxy buffering explicitly; verify on the deployed URL, not just locally |
| 5 | Five-day scope overrun | High | High | Day-4 checkpoint with a pre-agreed cut list |
| 6 | Seeded data looks artificial in the demo | Medium | Medium | Category-aware generation plus five planted scenarios |
| 7 | Agents produce inconsistent output shapes | High | High | Strict schemas on every hand-off; arithmetic moved out of prompts into code |
| 8 | Decimal/float confusion in money handling | Medium | Medium | Fixed-point throughout; conversion only at the API boundary; tests assert precision |
| 9 | Demo fails live due to LLM latency or outage | Low | High | Pre-seeded recommendations mean the detail view and queue demo without a live call; the simulate-event control triggers a fresh run only when the connection is known good |
| 10 | Explaining code you did not write | Medium | High | Interview-note sections through the implementation plan; read every generated block before committing |

---

# 22. Open questions

Questions a real product process would resolve before or during build. Recorded
here because an unrecorded assumption is worse than an acknowledged gap.

| # | Question | Current assumption | Who would decide |
|---|---|---|---|
| Q1 | Should auto-execution be capped by daily count or total revenue exposure, not just per-change confidence? | No cap in v1 | Pricing Manager |
| Q2 | Should rejection reasons feed back into prompts for future recommendations on the same product? | Stored and surfaced to humans, not injected into prompts | Product + engineering |
| Q3 | Should an Analyst be able to approve a change on a product they do not own? | Yes — no per-category ownership in v1 | Pricing Manager |
| Q4 | Is the confidence threshold the right single dial, or should it vary by category? | Single org-level dial, with category rules covering margin only | Pricing Manager |
| Q5 | Should competitor identity be visible to analysts, or anonymised? | Visible | Legal / commercial |
| Q6 | What is the retention period for audit records? | Indefinite in v1 | Compliance |
| Q7 | Should the system notify anyone when it auto-executes, or is the audit trail sufficient? | Audit trail only; no notifications in v1 | Product |
| Q8 | At what catalog size does on-demand generation stop being the right model? | Assumed adequate to ~1,000 SKUs | Engineering |

---

# Appendix A — Glossary

| Term | Meaning |
|---|---|
| **Agent** | One LLM invocation with a defined responsibility, its own tools and a strict output schema |
| **Agent run** | The persisted record of one agent invocation: input, output, tokens, duration, error |
| **Auto-execution** | A price change applied without human approval because confidence met the configured threshold |
| **Confidence score** | A deterministic 0–1 value combining agent self-reported confidences minus named penalties |
| **Confidence threshold** | The org-level value above which changes auto-execute |
| **Days of cover** | Inventory on hand divided by recent daily sales velocity |
| **Elasticity** | Percentage change in demand per percentage change in price; negative for normal goods |
| **Factor weights** | The strategy agent's declared attribution of its decision across four factors, summing to 1.0 |
| **Floor price** | The lowest price satisfying the margin floor, computed from cost in code |
| **Margin floor** | The minimum acceptable gross margin, per product or per category |
| **Multi-tenant** | One deployment serving multiple organizations with no cross-visibility |
| **Orchestrator** | The component sequencing agents and emitting progress events |
| **Planted scenario** | A seeded product deliberately configured to exercise a specific behaviour in the demo |
| **Rule engine** | Deterministic business-rule validation running independently of any agent |
| **SSE** | Server-Sent Events; the one-way streaming transport carrying agent progress |
| **Tenant** | An organization; the isolation boundary |

---

# Appendix B — Requirement traceability

Mapping the assessment's stated requirements to this document and to the build.

| Assessment requirement | PRD section | Priority |
|---|---|---|
| Authentication & role-based access | §9.1, §12.3 | P0 |
| Product catalog dashboard | §9.3, §15.3 | P0 |
| AI pricing engine (multi-agent) | §10 | P0 |
| Recommendation detail view | §9.6, §15.6 | P0 |
| Approval workflow (human-in-the-loop) | §9.5, §11.3 | P0 |
| Audit trail | §9.7, §15.8 | P0 |
| Configuration panel (admin) | §9.2, §15.7 | P0 |
| Competitor price data | §16.3 | P0 |
| Demand & trend signals | §16.3 | P0 |
| Inventory & cost data | §16.3 | P0 |
| E-commerce platform API (mock) | §9.8 | P0 |
| Working auth, no hardcoded logins | §9.1 | P0 |
| Persistent database with proper schema | §16 | P0 |
| Clean REST API with error handling | §13.3, API contract | P0 |
| Functional UI with loading/error/empty states | §13.4, §15 | P0 |
| CRUD on core data | §9.3 | P0 |
| Responsive design | NFR-U7 | P0 |
| LLM integration | §10 | P0 |
| Tool/function calling, ≥2 tools, model decides | AI-7, AI-9 | P0 |
| Structured output rendered as components | FR-EXP-1..9, §15 | P0 |
| Source attribution | FR-EXP-3, FR-EXP-4 | P0 |
| Graceful LLM failure handling | AI-21..25 | P0 |
| Data isolation | MT-1..6 | P0 |
| RBAC with ≥2 roles | §12.3 | P0 |
| Organization management | §9.2 | P0 |
| Tenant context in API | MT-2, MT-3 | P0 |
| Clean project structure | NFR-M2, M3 | P0 |
| Environment variables with .env.example | NFR-M6 | P0 |
| Error handling and validation both ends | NFR-S9, NFR-M4 | P0 |
| Logging | §13.7 | P0 |
| Clean commit history | NFR-M7 | P0 |
| **Bonus** — live deployment | §20 M5 | P1 |
| **Bonus** — real-time streaming | FR-GEN-2 | P1 |
| **Bonus** — Docker Compose | §20 M1 | P1 |
| **Bonus** — testing | §20 M5 | P1 |
| **Bonus** — CI/CD | §20 M5 | P1 |
| **Bonus** — caching & rate limiting | NFR-S8, C-1 | P1 |
| **Bonus** — export | §8.3 | P2 |
| **Bonus** — observability | §13.7 | P1 |
| **Bonus** — explainability dashboard | §11, §15.6 | P1 |
| **Bonus** — A/B testing | §3.3 NG-8 | deferred |
| **Bonus** — infrastructure as code | §3.3 | deferred |

---

# Appendix C — Competitive context

Brief, because it is not the focus, but worth having an answer ready.

| Category | Examples | How Pricewise differs |
|---|---|---|
| Enterprise pricing platforms | PROS, Zilliant, Pricefx | Powerful and expensive; long implementations; typically opaque models. Pricewise targets a mid-size catalog with legibility as the primary design constraint |
| E-commerce repricers | Marketplace repricing tools | Usually rule-based and marketplace-specific; fast but brittle, with no reasoning about inventory or margin |
| BI dashboards | Looker, Tableau on pricing data | Show you the data; do not produce a decision or carry an approval workflow |
| Spreadsheets | The actual incumbent | Free, flexible, universally understood, and the source of the 70%-of-analyst-time problem |

**The honest positioning:** the incumbent is a spreadsheet. Pricewise wins by
removing the gathering work and compressing the response cycle from a week to
minutes, *without* asking the analyst to surrender the decision. Any product in
this space that asks for that surrender on day one does not get adopted.

---

**End of PRD.**
