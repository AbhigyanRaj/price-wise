import { useState } from "react";
import { Link } from "react-router";
import { AGENT_DISPLAY_NAMES } from "@pricewise/shared";
import { Check, ChevronDown, ChevronLeft, Minus, Plus } from "lucide-react";
import { ConfidenceBadge, DeltaChip, Money, StatusBadge } from "@/components/data/Metrics";
import { SourcesSummary, ToolCallList } from "@/components/data/ToolCallList";
import { ConfidenceWaterfall } from "@/components/charts/ConfidenceWaterfall";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { absoluteTime, duration, money, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { AGENT_FACTOR, agentSummary, deriveImpacts } from "./impact";
import { PIPELINE_ORDER } from "./useAgentStream";
import type { AgentRunDto, RecommendationDetailDto } from "@/lib/types";

/**
 * The right pane: everything needed to take the decision, in the order a human
 * needs it.
 *
 * Price and confidence first, because that is the decision. Then what changes
 * if you take it. Then why the system thinks so, expandable rather than
 * present. The reasoning is the deepest thing on the page and the last thing
 * most people will read, which is exactly where it belongs.
 */
export function DecisionDetail({
  rec,
  threshold,
  onApprove,
  onReject,
  onModify,
  busy,
}: {
  rec: RecommendationDetailDto;
  threshold: number;
  onApprove: () => void;
  onReject: () => void;
  onModify: (price: number) => void;
  busy: boolean;
}) {
  const [modifying, setModifying] = useState(false);
  const [price, setPrice] = useState(() => rec.recommendedPrice.toFixed(2));

  const impacts = deriveImpacts(rec);
  const breakdown = rec.factorWeights?.confidenceBreakdown ?? null;
  const isPending = rec.status === "PENDING";
  const proposed = rec.modifiedPrice ?? rec.recommendedPrice;
  const clears = rec.confidenceScore >= threshold;

  const blocking = rec.agentRuns
    .flatMap((run) => {
      const output = (run.output as Record<string, unknown> | null) ?? null;
      const violations = output?.["violations"];
      return Array.isArray(violations) ? (violations as { rule: string; detail: string }[]) : [];
    })
    .filter(Boolean);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[920px] px-4 pb-[160px] pt-5 md:px-[34px] md:pb-[120px] md:pt-7">
        {/* Below md the queue and the detail are separate screens, so this is
            the "up" affordance. Browser Back does the same thing, but a
            navigation the app caused needs a visible way out. */}
        <Link
          to="/decisions"
          className="-ml-1 mb-3 inline-flex h-8 items-center gap-1 rounded-md pl-1 pr-2 text-[12px] text-t3 transition-colors duration-[110ms] hover:text-t1 lg:hidden"
        >
          <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          All decisions
        </Link>

        <p className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-t4">
          <span>{rec.product?.sku}</span>
          <span aria-hidden="true">·</span>
          <span>{rec.product?.category}</span>
          <span aria-hidden="true">·</span>
          <span title={absoluteTime(rec.createdAt)}>recommended {relativeTime(rec.createdAt)}</span>
          {!isPending && <StatusBadge status={rec.status} />}
        </p>

        <h2 className="mb-5">{rec.product?.name}</h2>

        {/* ---- Price and confidence ------------------------------------ */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow mb-1.5">Price</p>
            <p className="flex items-baseline gap-3">
              <Money value={rec.currentPriceAtTime} className="text-[19px] text-t3" />
              <span aria-hidden="true" className="text-t5">
                →
              </span>
              <Money value={proposed} className="text-[34px] font-semibold tracking-[-0.02em]" />
              <DeltaChip fraction={rec.deltaPct} className="text-[14px]" />
            </p>
          </div>

          <div className="min-w-[240px]">
            <p className="eyebrow mb-1.5">Confidence</p>
            <p className="mb-1.5 flex items-baseline gap-2">
              <span className="text-[14px] font-medium text-t1">
                {rec.confidenceScore >= 0.85
                  ? "High confidence"
                  : rec.confidenceScore >= 0.78
                    ? "Moderate confidence"
                    : "Needs review"}
              </span>
              <ConfidenceBadge value={rec.confidenceScore} />
            </p>
            <ConfidenceScale value={rec.confidenceScore} threshold={threshold} />
            <p className="mt-1.5 text-[11.5px] text-t4">
              {clears
                ? `At or above your ${threshold.toFixed(2)} threshold.`
                : `Below your ${threshold.toFixed(2)} threshold, so it came to you.`}
            </p>

            {/* The scale answers "how confident". The waterfall answers "why
                that number", which is the question an analyst actually has
                when the score is the thing standing between them and a
                decision. Collapsed, because it is a drill-down. */}
            {breakdown && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11.5px] text-acc-t2 underline-offset-2 hover:underline">
                  How this was calculated
                </summary>
                <div className="mt-3 rounded-inset border border-line bg-inset p-3">
                  <ConfidenceWaterfall breakdown={breakdown} threshold={threshold} />
                </div>
              </details>
            )}
          </div>
        </div>

        {/* ---- What changes if you take it ----------------------------- */}
        {impacts.length > 0 && (
          <div className="mb-7 grid gap-5 border-y border-line py-4 sm:grid-cols-2 lg:grid-cols-4">
            {impacts.map((impact) => (
              <div key={impact.label}>
                <p className="eyebrow mb-1.5">{impact.label}</p>
                <p
                  className={cn(
                    "tnum mb-1 font-mono text-[14px]",
                    impact.tone === "pos" && "text-pos",
                    impact.tone === "neg" && "text-neg",
                    impact.tone === "amber" && "text-amber",
                    impact.tone === "neutral" && "text-t1",
                  )}
                >
                  {impact.value}
                </p>
                <p className="text-[11.5px] leading-[1.5] text-t4">{impact.consequence}</p>
              </div>
            ))}
          </div>
        )}

        {/* ---- Rationale ------------------------------------------------ */}
        <section className="mb-7">
          <h3 className="mb-2">Why this price</h3>
          <p className="mb-3 max-w-[68ch] text-[13px] leading-[1.6] text-t1">{rec.rationale}</p>

          {/* Attribution for the recommendation as a whole. Without it the only
              provenance was on individual tool calls, two expansions deep,
              which is not what "every insight shows where its data came from"
              means. */}
          <div className="max-w-[68ch] rounded-inset border border-line bg-inset px-3.5 py-3">
            <p className="eyebrow mb-2">Drawn from</p>
            <SourcesSummary runs={rec.agentRuns} />
          </div>
        </section>

        {/* ---- Agent reasoning ------------------------------------------ */}
        <section className="mb-7">
          <h3 className="mb-2.5">What each agent contributed</h3>
          <ul className="space-y-1">
            {PIPELINE_ORDER.map((agent) => {
              const run = rec.agentRuns.find((r) => r.agentName === agent);
              if (!run) return null;
              return (
                <AgentRow
                  key={agent}
                  run={run}
                  weight={weightFor(rec, agent)}
                />
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-t5">
            Weights are the four factors the strategy agent reported, which sum to 1.00. Execution
            and Compliance carries none: it checks rules computed in code and may only tighten the
            outcome, never loosen it.
          </p>
        </section>

        {/* ---- Risk footer ---------------------------------------------- */}
        <div className="rounded-inset border border-line bg-inset px-3.5 py-3">
          <p className="flex items-start gap-2 text-[12.5px] leading-[1.6] text-t2">
            <Check size={14} strokeWidth={1.6} className="mt-0.5 shrink-0 text-pos" aria-hidden="true" />
            <span>
              {blocking.length > 0
                ? `A business rule blocked this: ${blocking.map((v) => v.detail).join("; ")}. It reaches you whatever the confidence.`
                : clears
                  ? `This cleared your ${threshold.toFixed(2)} threshold and passed every business rule. Nothing is blocking it.`
                  : `No rule violations. It is here because confidence is below your ${threshold.toFixed(2)} threshold, not because anything is wrong with it.`}
            </span>
          </p>
        </div>
      </div>

      {/* ---- Action bar ------------------------------------------------- */}
      {isPending && (
        <div className="sticky bottom-0 border-t border-line3 bg-[var(--bar-bg)] backdrop-blur-[14px]">
          {modifying && (
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-2.5 md:px-[34px]">
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  aria-label="Decrease price"
                  onClick={() => setPrice((p) => (Number(p) - 1).toFixed(2))}
                >
                  <Minus size={12} aria-hidden="true" />
                </Button>
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  type="number"
                  step="0.01"
                  aria-label="Your price"
                  className="tnum h-7 w-28 text-center font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  aria-label="Increase price"
                  onClick={() => setPrice((p) => (Number(p) + 1).toFixed(2))}
                >
                  <Plus size={12} aria-hidden="true" />
                </Button>
              </div>

              <p className="order-last w-full text-[11.5px] text-t4 md:order-none md:w-auto md:flex-1">
                {money(Number(price))} is{" "}
                {(((Number(price) - rec.currentPriceAtTime) / rec.currentPriceAtTime) * 100).toFixed(1)}%
                against the current price. Checked against the same margin floor as the AI.
              </p>

              <Button size="sm" variant="ghost" onClick={() => setModifying(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy || !price} onClick={() => onModify(Number(price))}>
                Approve at this price
              </Button>
            </div>
          )}

          <div className="flex h-14 items-center gap-2 px-4 md:px-[34px]">
            <Button size="sm" onClick={onApprove} disabled={busy} aria-keyshortcuts="a">
              Approve{" "}
              <kbd aria-hidden="true" className="keycap ml-1.5 hidden md:inline-block">
                A
              </kbd>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setModifying((v) => !v)}
              aria-keyshortcuts="m"
            >
              Modify{" "}
              <kbd aria-hidden="true" className="keycap ml-1.5 hidden md:inline-block">
                M
              </kbd>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onReject}
              disabled={busy}
              aria-keyshortcuts="r"
              className="ml-auto hover:border-neg-border hover:text-neg"
            >
              Reject{" "}
              <kbd aria-hidden="true" className="keycap ml-1.5 hidden md:inline-block">
                R
              </kbd>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function weightFor(rec: RecommendationDetailDto, agent: string): number | null {
  const key = AGENT_FACTOR[agent];
  if (!key) return null;
  const value = rec.factorWeights?.[key];
  return typeof value === "number" ? value : null;
}

function AgentRow({ run, weight }: { run: AgentRunDto; weight: number | null }) {
  const [open, setOpen] = useState(false);
  const failed = Boolean(run.error);

  return (
    <li className="rounded-md border border-line bg-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
            failed ? "bg-neg" : run.confidence !== null && run.confidence >= 0.8 ? "bg-pos" : "bg-amber",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] text-t2">
              {AGENT_DISPLAY_NAMES[run.agentName]}
            </span>
            {run.confidence !== null && <ConfidenceBadge value={run.confidence} />}
          </span>
          <span className="mt-1 block max-w-[62ch] text-[12.5px] leading-[1.5] text-t3">
            {agentSummary(run)}
          </span>
        </span>

        {weight !== null && (
          <span className="flex shrink-0 items-center gap-2">
            <span aria-hidden="true" className="h-1 w-[74px] overflow-hidden rounded-full bg-line">
              {/* Normalised against 0.40 rather than 1.00: four weights summing
                  to one means none of them ever exceeds about 0.4, and a bar
                  scaled to 1.00 would read as permanently near-empty. */}
              <span
                className="block h-full rounded-full bg-acc2"
                style={{ width: `${Math.min(100, (weight / 0.4) * 100)}%` }}
              />
            </span>
            <span className="tnum w-8 text-right font-mono text-[11px] text-t3">
              {weight.toFixed(2)}
            </span>
          </span>
        )}

        <ChevronDown
          size={13}
          strokeWidth={1.4}
          aria-hidden="true"
          className={cn("mt-1 shrink-0 text-t4 transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-line px-3 py-2.5">
          <ToolCallList calls={run.toolCalls} />
          <p className="font-mono text-[10px] text-t5">
            {run.model} · {run.promptTokens} + {run.completionTokens} tokens ·{" "}
            {duration(run.durationMs)}
          </p>
        </div>
      )}
    </li>
  );
}

/** Ten segments. A continuous bar invites reading precision that a confidence
 *  score does not have; discrete steps are honest about its granularity. */
function ConfidenceScale({ value, threshold }: { value: number; threshold: number }) {
  const filled = Math.round(value * 10);
  const thresholdSegment = Math.round(threshold * 10);

  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full",
            i < filled
              ? value >= 0.85
                ? "bg-pos"
                : value >= 0.78
                  ? "bg-amber"
                  : "bg-neg"
              : "bg-line",
            // Marks where the org's policy sits, so the bar is read against a
            // threshold rather than against a feeling.
            i + 1 === thresholdSegment && "outline outline-1 outline-offset-1 outline-t5",
          )}
        />
      ))}
    </span>
  );
}
