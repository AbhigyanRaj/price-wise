# Handoff: Pricewise — full product UI (Sign In, Overview, Products, Decisions, Activity, Settings)

## Overview

Pricewise is a continuous pricing-intelligence product. Five specialist agents (Market, Inventory, Demand, Strategy, Compliance) run continuously against a product catalogue; they produce **recommendations**, each with a confidence score. Recommendations above a configurable confidence threshold execute automatically; everything else is queued for a human.

This design is a complete redesign of that product's interface. The premise that drives every screen: **the human is a scarce resource.** The UI's job is to surface only what genuinely needs judgment, explain *why* it needs judgment, and make approving/rejecting/modifying fast enough to do with the keyboard.

Six surfaces: Sign In, Overview, Products, Decisions, Activity, Settings (Risk & automation), plus a global command palette and toast system.

## About the Design Files

The file in this bundle (`Pricewise.dc.html`) is a **design reference created in HTML** — a working prototype showing the intended look, motion and behaviour. It is **not production code to copy directly.** It is a single self-contained file using a lightweight template/logic runtime, inline styles and mock data.

The task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, native, etc.) using its established patterns, component library, routing and data layer. If no environment exists yet, choose the most appropriate framework and implement the designs there.

Read the prototype for exact visual values and interaction detail; do not port its runtime or its inline-style approach.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, density, motion and interaction states. Recreate pixel-accurately using the codebase's own libraries. Every hex value, font size and duration in this document is the intended production value.

Note on density: this is a professional data tool, deliberately denser than a consumer app. Base font size is 13px, table rows are 33px, the top bar is 46px. Do not loosen it to "standard" SaaS spacing — the density is the design.

---

## Design Tokens

All colors are defined as CSS custom properties on `:root`, with a light theme under `:root[data-pw-theme="light"]`. The app has a three-way theme control: **Light / System / Dark**. System reads `prefers-color-scheme` and re-applies live on change.

### Dark theme (default)

```
/* surfaces */
--bg:#0d0d10        page background
--chrome:#0a0a0d    top bar, rail, table headers, sticky headers
--panel:#131318     panels
--raised:#17171d    cards, popovers, drawers
--inset:#101014     inset/sunken blocks (detail cards, evidence blocks)
--input:#0c0c10     form fields
--hover:#191920     row hover
--sel:#1e1d28       selected row
--ctl:#1a1a21       secondary button
--ctlHover:#212028  secondary button hover

/* lines */
--line:#22212a      default hairline
--line2:#1a1a21     faint hairline (list separators)
--line3:#2a2933     stronger hairline
--border:#32313c    control border
--borderStrong:#403e4a  control border hover
--avatarBg:#2a2834

/* text ramp (t0 brightest → t6 faintest) */
--t0:#f5f3f9  --t1:#e8e6ef  --t2:#b3afbe  --t3:#8f8b9b
--t4:#6f6c7a  --t5:#585564  --t6:#3e3c48

/* accent (violet) */
--acc:#6f62e6  --accHover:#7f73f2  --acc2:#8f84f0
--accT:#a79cff  --accT2:#c4bcff  --accT3:#d5cfff
--focus:#5f55cf  --onAcc:#ffffff
--accA:rgba(120,107,240,.13)     accent wash
--accA2:rgba(120,107,240,.22)    accent wash strong
--accBorder:rgba(120,107,240,.36)
--accBand:rgba(120,107,240,.45)

/* semantic */
--pos:#4cc38a  --pos2:#74d4a6      positive / executed / high confidence
--neg:#e5645e  --neg2:#f08a85      negative / rejected / breach
--amber:#d8a13a  --amber2:#e5bc67  caution / auto-executing soon / margin risk
--posA:rgba(76,195,138,.13)
--negA:rgba(229,100,94,.13)   --negBorder:rgba(229,100,94,.34)
--amberA:rgba(216,161,58,.13) --amberBorder:rgba(216,161,58,.3)

/* scrims + elevation */
--scrim:rgba(6,6,9,.5)
--barBg:rgba(13,13,16,.82)   action bar (with backdrop-filter: blur(14px))
--shCard:0 20px 48px -22px rgba(0,0,0,.85), 0 1px 0 rgba(255,255,255,.03) inset
--shPop:0 32px 74px -28px rgba(0,0,0,.9), 0 1px 0 rgba(255,255,255,.04) inset
--shPanel:-28px 0 64px -34px rgba(0,0,0,.85)
--shThumb:0 2px 8px rgba(0,0,0,.6)
--shRow:0 1px 0 rgba(255,255,255,.02) inset
--noiseOpacity:.035
```

### Light theme (`[data-pw-theme="light"]`)

Not an inversion — a warm, paper-like surface family.

```
--bg:#f7f6f3  --chrome:#f1f0ec  --panel:#ffffff  --raised:#ffffff
--inset:#fbfaf8  --input:#ffffff  --hover:#f1efea  --sel:#efecfb
--ctl:#ffffff  --ctlHover:#f4f2ee
--line:#e5e2db  --line2:#edeae3  --line3:#ddd9d0
--border:#d5d1c7  --borderStrong:#b9b4a8  --avatarBg:#e7e4dc
--t0:#15151a  --t1:#26262e  --t2:#55535f  --t3:#6e6b78
--t4:#8b8794  --t5:#a4a0ab  --t6:#c6c2cb
--acc:#5a4bd4  --accHover:#4e40c4  --acc2:#6355db
--accT:#5343c9  --accT2:#4635b8  --accT3:#8478e8
--focus:#a79cff  --onAcc:#ffffff
--accA:rgba(90,75,212,.07)  --accA2:rgba(90,75,212,.13)
--accBorder:rgba(90,75,212,.26)  --accBand:rgba(90,75,212,.34)
--pos:#2c8c5f  --pos2:#1f7350  --neg:#c2463d  --neg2:#a8362e
--amber:#96670e  --amber2:#7d5609
--posA:rgba(44,140,95,.09)  --negA:rgba(194,70,61,.08)
--negBorder:rgba(194,70,61,.28)
--amberA:rgba(150,103,14,.09)  --amberBorder:rgba(150,103,14,.24)
--scrim:rgba(46,43,38,.26)  --barBg:rgba(247,246,243,.84)
--shCard:0 14px 34px -16px rgba(58,54,46,.22), 0 1px 2px rgba(58,54,46,.06)
--shPop:0 26px 60px -22px rgba(58,54,46,.28), 0 1px 3px rgba(58,54,46,.08)
--shPanel:-26px 0 54px -32px rgba(58,54,46,.24)
--shThumb:0 2px 6px rgba(58,54,46,.28)
--shRow:none
--noiseOpacity:.05
```

Semantic colors are **retuned per theme, not reused** — the dark `--pos:#4cc38a` fails contrast on paper, so light uses `#2c8c5f`. Do the same for any new semantic color.

### Global atmosphere (both themes)

- `--env`: two very wide radial gradients painted on the app background — dark: `radial-gradient(1300px 720px at 16% -14%, rgba(120,107,240,.10), transparent 62%)` + `radial-gradient(1000px 560px at 98% -6%, rgba(255,255,255,.035), transparent 60%)`. Light uses `rgba(90,75,212,.055)` and `rgba(255,255,255,.9)`.
- A fixed, non-interactive SVG fractal-noise overlay across the whole viewport at `--noiseOpacity` (`feTurbulence baseFrequency=0.9 numOctaves=3`, desaturated, 150×150 tile). It's what keeps the large flat surfaces from looking plastic. Keep it.
- Global transition: `body * { transition: background-color, border-color, color, fill, stroke 170ms cubic-bezier(.2,.8,.2,1) }` — makes theme switching cross-fade rather than snap.

### Typography

Two families only.

| Role | Family | Notes |
|---|---|---|
| UI, prose, headings | **Instrument Sans** (400/500/600/700) | `-webkit-font-smoothing: antialiased` |
| All numbers, IDs, SKUs, labels, keycaps | **JetBrains Mono** (400/500/600) | always `font-variant-numeric: tabular-nums` on numerals |

Rule: **anything a user might compare vertically is mono with tabular figures** — prices, deltas, percentages, confidence, timestamps, SKUs, event IDs. Anything they read as language is Instrument Sans. Never mix within a value.

Scale (px / line-height / letter-spacing / weight):

```
Page H1            27 / 1.15 / -0.025em / 600
Auth H1            38 / 1.08 / -0.028em / 600
Detail H2          23 / 1.20 / -0.022em / 600
Settings H1        22 / 1.2  / -0.022em / 600
Drawer title       16 / 1.2  / -0.015em / 600
Section title      13   / -0.005em / 600
Body               13 / 1.45 / 400
Secondary body     12.5 / 1.6 / 400      (--t3)
Row label          12.5 / 500
Small / meta       11.5 / 400            (--t3/--t4)
Micro              11 / 400              (--t4)
Hero number (mono) 34 / 1 / -0.02em / 600
Metric (mono)      22 / 1 / -0.01em / 500
Value (mono)       12–14 / 1 / 400–500
Eyebrow (mono)     9.5–10 / 1 / .12–.18em tracking / 500 / uppercase / --t4
Keycap (mono)      9.5 / 500, 1px border --border, radius 3, padding 2px 4px
```

Minimum type size anywhere is 9.5px, used **only** for uppercase mono eyebrows and keycaps.

### Spacing, radius, motion

- Spacing scale: 2 / 4 / 6 / 8 / 10 / 12 / 14 / 18 / 22 / 26 / 30 / 34. Page gutter 34px (26px on the products table). Panel gutter 18–20px.
- Radius: 3 keycaps · 4 tag/chip · 5 small control · 6 input, button, chip · 7 inset block · 8 toast · 10–12 card/popover · 50% dots and avatars-as-circles.
- Durations: 110–140ms hover/color · 160–200ms enter/expand · 220ms rail indicator · 260–340ms value morph · 700ms bar growth.
- Easing: `cubic-bezier(.2,.8,.2,1)` for anything that moves in space; plain `ease` for opacity/color.
- Keyframes used: `pwIn` (fade + 6px rise), `pwDrawer` (fade + 18px slide from right), `pwPal` (fade + 8px drop + 0.985 scale), `pwToast` (fade + 10px rise), `pwBreathe` (opacity .30↔.95, 3.4s), `pwRise`, `pwSpin`, `pwPing`, `pwShimmer`, `pwTrace`.
- `@media (prefers-reduced-motion: reduce)` forces all animation/transition durations to 0.001ms. Preserve this.

---

## App shell

Two fixed chrome elements wrap every signed-in screen.

### Top bar — 46px, `--chrome`, 1px bottom `--line`, `z-index:30`

Left (fixed 64px block, centred): the Pricewise mark — three rounded bars of increasing height, `fill: --acc / --acc2 / --accT3`, 16×16 in-app (18×18 on auth).
Then: workspace name "Northwind Retail" 12.5/600 + chevron (9px, 45% opacity) + 1px×14px divider + environment pill: 5px breathing dot (`--pos`, `pwBreathe`) + "production" in 10.5px mono `--t3`.

Centre: the command-palette trigger — max-width 400px, height 27px, `--panel`-ish `#101015` fill, 1px `--line`, radius 6, search glyph, placeholder "Search products, decisions, activity…" 11.5px `--t4`, and a `⌘K` keycap on the right. Hover lifts border to `--line3`.

Right: pending-work pill (accent wash, 1px `--accBorder`, 5px dot, "N awaiting you" in `--accT2` 11.5/500) → navigates to Decisions. Then divider, theme segmented control (Light/System/Dark), then a 22px rounded-square avatar (`--avatarBg`, initials 10/600) + chevron.

### Left rail — 64px, `--chrome`, 1px right `--line`

Five icon+label buttons, 52px tall each, icon 16px above a 9.5px label. Active `--t0`, idle `--t4`, hover `--t1`. A 2px×24px accent bar (`--acc2`, radius `0 2 2 0`) rides the left edge, animating `top` over 220ms — this is the only nav affordance that moves. Decisions carries a pill badge (min 14px, radius 7, `--acc`, white 9px mono) with the pending count. A sign-out icon button sits at the bottom.

Icons are 16px stroked SVG at 1.2px, `currentColor`, no fills except where a dot must knock out the background.

### Command palette (⌘K / Ctrl-K)

Full-screen scrim `--scrim` + `backdrop-filter: blur(3px)`. Panel 560px max, `--raised`, 1px `--line3`, radius 11, `--shPop`, entering with `pwPal` 140ms. 46px input row (14px text, no border, ESC keycap on the right), then grouped results, max-height 44vh.

Groups: **GO TO** (the five screens) · **DECISIONS** (pending, labelled "Name · −3.6%") · **PRODUCTS** (only when the query is non-empty, max 6) · **ACTIONS** ("Approve all pending", "Sign out"). Each row: 18px rounded-square icon chip with a 2-letter mono code, label, right-aligned hint (SKU or "jump"), 6px radius, hover `--hover`. Empty state: `No matches for "<query>"`.

### Toast

Fixed, bottom-centre, 26px from the bottom. `--raised`, 1px `--line3`, radius 8, `--shPop`, `pwToast` 180ms. Contents: 6px status dot · message · mono value · **Undo** button. Auto-dismisses after 4.2s. Undo restores the resolved decision to the queue and re-selects it.

---

## Screens

### 1. Sign In

Centred composition, max-width 1000px, two columns with 48px gap, wrapping.

**Left column** (flex 1 1 400px): mark + "Pricewise" wordmark → mono eyebrow `CONTINUOUS PRICING INTELLIGENCE` (10px, .18em, `--t4`) → H1 "Five specialists. One price." (38px, max-width 14ch) → 14px/1.6 paragraph, max-width 44ch: "Market, inventory, demand, strategy and compliance run continuously. You are only brought in when a decision genuinely needs human judgment."

Below it, a live demo block (max-width 440px, `--inset`, 1px `--line`, radius 10): a header strip (`--chrome`) with SKU `NW-ELEC-0002` and an "N of 5" counter; then the five agents, each a row of `[state dot] [MONO KEY, 96px] [name] [state]` stepping through queued → analysing → complete on a 780ms interval; then a footer that fades in "Recommendation ready" + `$790.77 → $762.22` once all five finish, over a `--posA` wash. The loop restarts every 9 ticks.

**Right column** (fixed 352px): `--raised` card, 1px `--line3`, radius 12, 26px padding, `--shCard`. "Sign in" 15/600, "Northwind Retail · production workspace" 12.5 `--t3`. Email + password fields (34px, `--input`, 1px `--border`, radius 6, 12.5px; focus → `border-color: --focus`). Primary button full-width 34px `--acc`, white, 12.5/600, hover `--accHover`. Then a mono `DEMO ACCESS` rule and two selectable demo rows (`admin@northwind.test` / Admin, `analyst@northwind.test` / Pricing Analyst) that prefill both fields on click.

> **In flight:** this screen is mid-redesign into a ~52/48 split with a full-height, cursor-reactive generative canvas on the left and a decoration-free form on the right, plus a Create-account mode. The spec above documents the **current shipped** state. If the redesigned version is in the prototype when you receive it, that one wins.

### 2. Overview

Scrolling column, 34px gutters.

**Header:** "Good afternoon, Ada" 12.5 `--t3` → H1, which is a *statement about the queue*, not a page title: "4 decisions need your attention." → sub-line naming the sharpest fact: "One is above your auto-execution threshold and will apply itself in 2 hours." Right-aligned: `LAST SWEEP` eyebrow + "2 minutes ago · 1,284 prices".

**Intelligence Pulse** — a full-bleed band, `--chrome`, hairline top and bottom, eyebrow `INTELLIGENCE PULSE` + "five specialists · continuous". Five equal columns separated by 1px `--line2`, each: status dot + mono agent key · state text (`monitoring` / `signal detected` / `evaluating` / `updated` / `healthy`) · a mono detail line (e.g. "1,284 prices · 22 SKUs") · a 2px activity bar. States advance on a 2.4s interval with a per-agent offset, so the row is never in lockstep; `evaluating` adds the `pwBreathe` pulse to its dot. Color follows the state: idle `--t3`/`--t6`, signal `--amber2`, evaluating `--accT`, updated `--pos2`.

**Awaiting your decision** (main column): title + "Open workspace →" and the rule "Ordered by the cost of getting it wrong, not by age." Each row is 11px tall padding, separated by `--line2`, hover `--hover`: a 2px accent spine (amber if auto-executing, `--acc2` if high confidence, `--line3` otherwise) · name 13/500 + mono SKU · the lead agent's one-line reason (11.5 `--t3`, truncated) · right block: recommended price 13px mono, and under it the struck-through current price + delta · confidence % over a 52px bar · a flag column ("auto in 2h" amber, or "needs review").

**Recent activity**: five compact rows — mono time (58px) · 5px kind dot · text · mono tag, separated by `--line2`.

**Position rail** (282px, left hairline, own scroll): eyebrow `POSITION`, then five metrics, each `label 11.5 --t3` / `value 22px mono` / `sub 11px --t4`:
`Margin at stake in the queue $18,420` · `Executed automatically · 7d 12` · `Opportunities found today 7` · `Mean confidence · 30d 0.80` (amber, "down 0.03 — market dispersion widening") · `Products needing intervention 3` (neg). Foot of the rail, 11px mono `--t5`: "Auto-execution at ≥ 0.85 / Max single change ±20%".

### 3. Products

**Header** (`--chrome`, 26px gutter): "Products" + "N of 32 shown"; right, a 230px filter input ("Filter by SKU or name"). Below, four view tabs — All products · Has recommendation · Overstocked · Margin risk — each with a mono count and a 1.5px accent underline when active.

**Table**: `min-width:1000px`, sticky `--chrome` header, mono uppercase column labels (9.5px, .12em, `--t4`), 33px rows, 1px `--line2` separators, hover `--hover`, selected `--sel`.

Columns: SKU (mono 10.5 `--t4`) · PRODUCT (12.5 `--t1`) · PRICE (mono 12/500) · MARKET (mono 12 `--t3`) · **GAP** · MARGIN (amber below 20%) · INVENTORY (count + `low`/`overstocked` qualifier) · **RECOMMENDATION**.

The **GAP** cell is the signature micro-visual: a 56px track with a 1px centre tick (`--line3`) and a 4px bar growing left (below market, `--neg`) or right (above, `--pos`) from centre, clamped at ±25%, followed by the signed percentage in mono. It lets you read the entire catalogue's competitive position by scanning one column.

The **RECOMMENDATION** cell: price · delta · a 30px confidence bar · the confidence number. Rows with no recommendation read `at target` in `--t6` — deliberately almost invisible, so the eye lands only on rows that need something.

**Product inspector** — a 430px right drawer, `--raised`/`#0c0b0f`, 1px left `--line3`, `--shPanel`, `pwDrawer` 200ms, ESC closes. Sticky header with SKU + name + close. Then: a 2-column stat grid (current price, competitor median, gap, margin, inventory, demand index); a **90-day price history** — inline SVG, 390×96: our price as a 1.5px `--acc2` line over a `rgba(111,98,230,.09)` area fill, market median as a 1.2px dashed `--t6` line, and 3px amber-ringed dots marking past decisions, with a three-item legend; the **active recommendation** (struck current → 20px recommended → delta) with each agent's one-liner and a button into the decision workspace; and **decision history**, date + sentence per row.

### 4. Decisions — the core screen

Two panes.

**Queue (376px, `--chrome`, right hairline):** title + "N pending"; a 4-way segmented filter (Pending / Approved / Auto / Rejected) in a 2px-padded `--panel` track, active segment `--line3`. A batch bar appears when anything is checked: "N selected" on an accent wash with Clear / Approve all.

Each queue card (11px padding, `--line2` separator, 2px `--acc2` spine when selected, `--sel` fill): a 13px checkbox (accent when checked) · name + delta on one line · SKU + `current → recommended` on the next · then a full-width 2px confidence bar with the confidence number and the age. Hover `--hover`.

Footer strip, 10px mono `--t5`: `J/K move  A approve  M modify  R reject`.

Empty state: "Queue clear" + "Pricewise keeps watching. You'll be brought back in when something needs judgment."

**Detail pane (fluid, max-width 920px, 34px gutter, 120px bottom padding for the action bar):**

1. **Meta line**: SKU · category · "recommended 6h ago" · optional amber pill "auto-executes in 2h".
2. **H2** product name, 23px.
3. **Price block**: `Current` (19px mono `--t3`) → a 20×12px arrow → `Recommended` (34px mono 600) with the delta at 14px in `--pos`/`--neg`. Right-aligned in the same row: the **confidence scale** — label ("High confidence" ≥0.85 / "Moderate confidence" ≥0.78 / "Needs review") + raw value, a 10-segment 4px bar (filled segments take the confidence color, empty are `--line`), and a note stating the relationship to the user's threshold.
4. **Impact row**: four columns (Margin, Competitive position, Inventory, Demand), each `label / value (14px mono, semantic color) / consequence sentence`. Values are written as transitions — `38.2% → 36.9%`, `−11.0% → −2.1%` — never bare numbers.
5. **Why Pricewise recommends this**: five expandable agent rows. Collapsed: mono key + signal dot (strong `--pos`, blocking/attention `--amber`, weak `--t6`, neutral `--t3`) · a plain-language sentence · a 74px contribution bar + weight (e.g. `0.34`). Expanded (`pwIn` 160ms): an `--inset` block with the detailed reasoning and a mono footer of `source · updated · signal`. Weights across the five sum to 1.00 and are normalised against 0.40 for the bar.
6. **Risk footer**: a bordered `--inset` note with a check glyph, stating exactly what policy says about this change ("Above your 0.85 auto-execution threshold — this will apply itself in 2 hours unless you act…").

**Action bar** — sticky bottom, 56px, `--barBg` + `backdrop-filter: blur(14px)`, 1px top `--line3`: **Approve** (accent, with an `A` keycap) · **Approve & execute now** (secondary) · **Modify** (`M`) · right-aligned **Reject** (`R`, hover turns text `--neg` and border `--negBorder`).

**Modify** raises a bar above the action bar: a stepper (− / mono price input / +) with a live note computing the delta from current and confirming it's inside policy, then Cancel / "Approve at this price".

Resolving a decision removes it from the queue, auto-selects the next one, and fires an undoable toast.

### 5. Activity

Append-only audit log. Header: "Activity" + "append-only · N events"; filter chips (All / Decisions / Executions / Market / Team) — active chip is an accent wash with `--accBorder` and `--accT2` text.

Sticky mono day dividers (`TODAY`, `EARLIER`). Each event row (10px × 34px, `--line2` separator, hover `--hover`): mono time (52px) · 19px rounded-square actor avatar — `PW` for Pricewise itself uses the accent wash and `--accT`, humans use `--avatarBg` — · sentence · mono value · a tag chip · a caret that rotates 180° when open.

Tag chips: `EXECUTED`/`AUTO` positive wash, `REJECTED` negative, `MODIFIED` amber, `MARKET`/`TEAM`/`SYSTEM` neutral `--line`.

Expanded (`pwIn`): an `--inset` card containing a field grid (Before / After / Actor / Latency etc., mono values with semantic color), then a rule, then the human reason, then a mono footer with the raw event name and event id — e.g. `PRICE_AUTO_EXECUTED  evt_8f3f12`. The audit trail is the product's trust surface: every automated action shows its policy justification.

### 6. Settings — "Risk & automation"

Single 780px column. H1 "Risk & automation", sub: "How much of the pricing decision you delegate, and the hard limits Pricewise may never cross."

**Auto-execution threshold** — the important control. Title row with the live value at 19px mono. Above the slider sits a **histogram of the last 50 recommendation confidences**, each a 3px bar positioned by value; bars at or above the threshold are `--acc`, below are `--line`, re-coloring live as you drag. The track is 2px with a 14px white handle ringed 3px in `--acc` and `--shThumb`. Axis labels: "0.50 · everything asks you" / "1.00 · nothing auto-executes".

Below, a consequence panel that rewrites itself as you drag: *"At 0.85, 12 of your last 50 recommendations would have executed automatically — 24% of decisions, worth $6,144 in price movement."* plus a judgement line that changes band by band (≥0.90 "Conservative…", ≥0.80 "Balanced…", else "Aggressive…"). A setting should show its consequences, not just its value.

**Maximum single price change** — ±5…40%, same slider anatomy. Its preview is a price band drawn against a real product: a track with the current price as a centre tick and the permitted range as an accent segment, labelled with the computed low and high, plus "Any recommendation outside this band is discarded before it reaches you, whatever its confidence."

**Team** — rows of 26px avatar · name + email · scope · role; a pending invite renders in `--t3` with an em-dash avatar. Invite row: email input + role select + "Send invite".

---

## Interactions & Behavior

**Keyboard**
- `⌘K` / `Ctrl-K` toggles the palette (preventDefault).
- `Esc` closes palette, drawer and modify bar.
- On Decisions only, when no field is focused and the palette is closed: `J`/`K` move the selection, `A` approve, `M` modify, `R` reject.
- Ignore shortcuts when `event.target` is an `INPUT` or `TEXTAREA`.

**Navigation** — client-side view switching; the rail indicator animates, the drawer and modify state reset on navigate.

**Resolving a decision** — `approve` / `executed` / `rejected` / `modified(price)`: mark resolved, drop from the queue, select the next (or previous) item, clear any batch selection for it, and toast with an Undo that fully restores it.

**Batch** — checkbox per queue item (`stopPropagation` so it doesn't select the row); "Approve all" resolves every checked item and toasts once.

**Sliders** — pointer-driven: `pointerdown` positions immediately, then `pointermove` on `window` until `pointerup`. Value = `clamp((clientX − rect.left) / rect.width)` mapped to range and snapped to step (0.01 for threshold, 1 for max change).

**Theme** — Light / System / Dark written to `data-pw-theme` on the root. System subscribes to `matchMedia('(prefers-color-scheme: dark)')` and re-applies on change. Persist the choice.

**Timers** — a 780ms interval driving the sign-in agent sequence (only while signed out) and a 2.4s interval driving the pulse. Clear both on unmount. Pause when the tab is hidden.

**Responsive** — the signed-in app is intentionally fixed at `min-width: 1240px` and scrolls horizontally below that: it's a data terminal, not a responsive marketing page. Sign In is fluid and wraps. If the target platform needs a real small-screen experience, that's a separate design.

**Empty / loading / error states specified**: queue clear, no selection ("Nothing awaiting judgment" + "The five specialists are still running…"), palette no-match, at-target products, pending invite. Loading and server-error states are **not** yet designed — ask before inventing them.

---

## State Management

```
auth        signedIn, email, password, authStep (sign-in animation)
nav         view: overview|products|decisions|activity|settings
theme       theme: light|system|dark
palette     palette (open), pq (query), palIdx, recents
decisions   selId, resolved: {id → approved|executed|rejected|modified},
            batch: {id → true}, tab, modifying, modPrice, modNote,
            openAgent: {decisionId+index → true}, actionState, rejectOpen
products    q (filter), savedView, inspectSku
activity    actFilter, openEvent: {index → true}
settings    threshold (0.50–1.00, step .01), maxChange (5–40, step 1)
transient   toast {text, value, dot, id}, tick, hoverAgent, animCur, animRec
```

**Data the real implementation needs:** products (sku, name, category, price, competitorMedian, marginPct, inventory, inventoryState, recommendedPrice?, confidence?); recommendations (id, sku, current, recommended, confidence, ageHours, autoExecutesAt?, impact[4], risk, agents[5] with key/line/detail/source/updated/signal/weight); activity events (time, actor, kind, text, value, tag, rawEvent, eventId, fields[], reason); policy (threshold, maxChangePct, margin floors per category, dual-sign-off line); team members.

**Content rules** — these carry as much of the design as the pixels:
- Never show a number without its consequence. `38.2% → 36.9%` beats `36.9%`.
- Agent explanations are full sentences in plain English, never bullet fragments or jargon.
- The Overview headline states the situation, not the page name.
- Policy language is concrete and quantified: "−3.6% is well within the configured ±20% maximum adjustment."

## Assets

No images, no icon library, no third-party dependencies. Every icon is hand-written inline SVG at 16px (14px in the rail footer, 9–13px for carets/glyphs), 1.2px strokes, `currentColor`. The logo is three rounded bars in an 18×18 box. The only external resources are the two Google Fonts. The noise texture is an inline `data:` SVG.

## Files

- `Pricewise.dc.html` — the complete prototype: all six screens, both themes, the palette, toasts, drawer, keyboard model, and the mock dataset (22 products, 5 recommendations with full agent reasoning, 8 activity events, 50-point confidence distribution). Open it directly in a browser. Use the Tweaks/props `startScreen` to land on any screen, or sign out from the rail to reach Sign In.
