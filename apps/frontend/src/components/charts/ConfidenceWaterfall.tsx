import type { ConfidenceBreakdown } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * A bridge chart: base score, each named penalty as a labelled deduction, then
 * the final score, with the organization's threshold drawn across it.
 *
 * Built with plain divs rather than Recharts. A waterfall needs floating bars
 * with connector lines and a label on every value, which is fighting a charting
 * library rather than using one, and this way every pixel is explainable.
 *
 * Three rules from the published guidance on bridge charts, all load-bearing:
 *   1. Label every value. Floating rectangles cannot be compared by height.
 *   2. Connector lines between bars. They are what makes a bridge legible.
 *   3. Three colours only: neutral for totals, one for deductions, and the
 *      final bar coloured by whether it cleared the threshold.
 */
export function ConfidenceWaterfall({
  breakdown,
  threshold,
}: {
  breakdown: ConfidenceBreakdown;
  threshold: number;
}) {
  const { base, penalties, final } = breakdown;
  const cleared = final >= threshold;

  // Steps as running totals, so each deduction floats from where the previous
  // one landed.
  let running = base;
  const steps = [
    { label: "Base score", from: 0, to: base, kind: "total" as const, amount: base },
    ...penalties.map((penalty) => {
      const from = running;
      running = Math.max(0, running - penalty.amount);
      return {
        label: penalty.reason,
        from: running,
        to: from,
        kind: "deduction" as const,
        amount: -penalty.amount,
      };
    }),
    { label: "Final", from: 0, to: final, kind: "final" as const, amount: final },
  ];

  return (
    <div>
      <div className="relative">
        {/* The threshold, with its value stated inline. A line without a number
            leaves the reader guessing what it represents. */}
        <div
          className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
          style={{ bottom: `${threshold * 100}%` }}
        >
          <div className="h-px flex-1 border-t border-dashed border-t5" />
          <span className="tnum ml-2 shrink-0 font-mono text-[10px] text-t4">
            threshold {threshold.toFixed(2)}
          </span>
        </div>

        <div className="flex h-44 items-end gap-1.5">
          {steps.map((step, index) => {
            const height = Math.max(Math.abs(step.to - step.from) * 100, 1.5);
            const offset = Math.min(step.from, step.to) * 100;

            return (
              <div key={index} className="relative flex min-w-0 flex-1 flex-col justify-end">
                <span
                  className="tnum absolute w-full text-center font-mono text-[10px] text-t3"
                  style={{ bottom: `calc(${offset + height}% + 2px)` }}
                >
                  {step.kind === "deduction"
                    ? step.amount.toFixed(2)
                    : step.amount.toFixed(2)}
                </span>

                <div
                  className={cn(
                    "w-full rounded-sm",
                    step.kind === "total" && "bg-t4",
                    step.kind === "deduction" && "bg-amber",
                    step.kind === "final" && (cleared ? "bg-pos" : "bg-neg"),
                  )}
                  style={{ height: `${height}%`, marginBottom: `${offset}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <ol className="mt-3 space-y-1 border-t border-line pt-2">
        {steps.map((step, index) => (
          <li key={index} className="flex items-baseline justify-between gap-3 text-[12px]">
            <span
              className={cn(
                "truncate",
                step.kind === "deduction" ? "text-t3" : "font-medium text-t1",
              )}
            >
              {step.label}
            </span>
            <span
              className={cn(
                "tnum shrink-0 font-mono",
                step.kind === "deduction" && "text-amber",
                step.kind === "final" && (cleared ? "text-pos" : "text-neg"),
                step.kind === "total" && "text-t3",
              )}
            >
              {step.kind === "deduction" ? step.amount.toFixed(2) : step.amount.toFixed(2)}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-2 text-[12px] text-t3">
        {cleared
          ? `Cleared the ${threshold.toFixed(2)} threshold, so this executed automatically.`
          : `Below the ${threshold.toFixed(2)} threshold, so it came to you for a decision.`}
      </p>
    </div>
  );
}

/** Factor weights as a single stacked bar. Four numbers summing to one is a
 *  composition, and a stacked bar shows composition better than four separate
 *  bars do. */
export function FactorWeights({
  weights,
}: {
  weights: { competitorPressure: number; demandSignal: number; inventoryPosition: number; marginProtection: number };
}) {
  const factors = [
    { label: "Competitor pressure", value: weights.competitorPressure, className: "bg-acc" },
    { label: "Demand signal", value: weights.demandSignal, className: "bg-pos" },
    { label: "Inventory position", value: weights.inventoryPosition, className: "bg-amber" },
    { label: "Margin protection", value: weights.marginProtection, className: "bg-t4" },
  ];

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full">
        {factors.map((factor) => (
          <div
            key={factor.label}
            className={factor.className}
            style={{ width: `${factor.value * 100}%` }}
            title={`${factor.label}: ${(factor.value * 100).toFixed(0)}%`}
          />
        ))}
      </div>

      <ul className="mt-2.5 space-y-1">
        {factors.map((factor) => (
          <li key={factor.label} className="flex items-center gap-2 text-[12px]">
            <span className={cn("h-2 w-2 shrink-0 rounded-sm", factor.className)} aria-hidden="true" />
            <span className="flex-1 text-t3">{factor.label}</span>
            <span className="tnum font-mono text-t1">{(factor.value * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
