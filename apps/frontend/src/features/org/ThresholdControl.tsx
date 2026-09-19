import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { RecommendationDto } from "@/lib/types";

/**
 * The auto-execution threshold, shown with its consequences rather than as a
 * number.
 *
 * A slider labelled 0.50 to 1.00 tells an admin nothing about what they are
 * choosing. The histogram is every recent recommendation placed by its
 * confidence, so the threshold is dragged through a real distribution and you
 * can see exactly which decisions cross the line. The panel underneath states
 * the outcome in decisions and money.
 *
 * Every figure comes from the recommendations actually in the database. None
 * of it is illustrative.
 */
export function ThresholdControl({
  value,
  onChange,
  recent,
}: {
  value: number;
  onChange: (next: number) => void;
  recent: RecommendationDto[];
}) {
  const wouldExecute = recent.filter((r) => r.confidenceScore >= value);
  const share = recent.length > 0 ? wouldExecute.length / recent.length : 0;

  // The money a price actually moves, not the price itself. Summing prices
  // would claim a far larger number for the same decision.
  const movement = wouldExecute.reduce(
    (sum, r) => sum + Math.abs(r.recommendedPrice - r.currentPriceAtTime),
    0,
  );

  const judgement =
    value >= 0.9
      ? "Conservative. Almost everything comes to a human, which is safe and slow."
      : value >= 0.8
        ? "Balanced. The clear cases execute, the ambiguous ones reach you."
        : "Aggressive. A large share executes without review; be sure the floors are right.";

  return (
    <section className="rounded-card border border-line bg-panel p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h3>Auto-execution threshold</h3>
          <p className="mt-0.5 text-[11.5px] text-t4">
            Recommendations at or above this execute without you.
          </p>
        </div>
        <span className="tnum font-mono text-[19px] text-t0">{value.toFixed(2)}</span>
      </div>

      {recent.length > 0 && (
        <div className="mb-2 flex h-14 items-end gap-[2px]" aria-hidden="true">
          {[...recent]
            .sort((a, b) => a.confidenceScore - b.confidenceScore)
            .map((rec) => (
              <span
                key={rec.id}
                title={`${rec.product?.sku} at ${rec.confidenceScore.toFixed(2)}`}
                className={cn(
                  "w-[3px] flex-1 rounded-[1px] transition-colors duration-[110ms]",
                  rec.confidenceScore >= value ? "bg-acc" : "bg-line",
                )}
                // Scaled from 0.5, where the slider starts. From zero every bar
                // would be tall and the distribution would be invisible.
                style={{ height: `${Math.max(6, ((rec.confidenceScore - 0.5) / 0.5) * 100)}%` }}
              />
            ))}
        </div>
      )}

      <input
        type="range"
        min={0.5}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Confidence threshold"
        aria-valuetext={`${value.toFixed(2)}, ${wouldExecute.length} of ${recent.length} would execute automatically`}
        className="w-full accent-[var(--acc)]"
      />

      <div className="mt-1 flex justify-between font-mono text-[10px] text-t5">
        <span>0.50 · everything asks you</span>
        <span>1.00 · nothing auto-executes</span>
      </div>

      <div className="mt-4 rounded-inset border border-line bg-inset px-3.5 py-3">
        {recent.length === 0 ? (
          <p className="text-[12.5px] text-t3">
            No recommendations yet, so there is nothing to measure this against.
          </p>
        ) : (
          <>
            <p className="text-[12.5px] leading-[1.6] text-t2">
              At {value.toFixed(2)}, <span className="tnum font-mono text-t0">{wouldExecute.length}</span>{" "}
              of your last <span className="tnum font-mono">{recent.length}</span> recommendations
              would have executed automatically, {Math.round(share * 100)}% of decisions, moving{" "}
              <span className="tnum font-mono text-t0">{money(movement)}</span> of price without
              review.
            </p>
            <p className="mt-1.5 text-[11.5px] text-t4">{judgement}</p>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The maximum single price move, drawn against a real product.
 *
 * ±20% is abstract. The same limit expressed as "this product may move between
 * $263.99 and $395.99" is a thing an admin can judge.
 */
export function DeltaControl({
  value,
  onChange,
  sample,
}: {
  value: number;
  onChange: (next: number) => void;
  sample: { name: string; currentPrice: number } | null;
}) {
  const low = sample ? sample.currentPrice * (1 - value) : 0;
  const high = sample ? sample.currentPrice * (1 + value) : 0;

  return (
    <section className="rounded-card border border-line bg-panel p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h3>Maximum single price change</h3>
          <p className="mt-0.5 text-[11.5px] text-t4">
            A larger move is discarded before it reaches you, whatever its confidence.
          </p>
        </div>
        <span className="tnum font-mono text-[19px] text-t0">±{Math.round(value * 100)}%</span>
      </div>

      <input
        type="range"
        min={0.05}
        max={0.4}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Maximum price change"
        aria-valuetext={`plus or minus ${Math.round(value * 100)} percent`}
        className="w-full accent-[var(--acc)]"
      />

      {sample && (
        <div className="mt-4 rounded-inset border border-line bg-inset px-3.5 py-3">
          <p className="mb-2.5 text-[11.5px] text-t4">
            Against {sample.name}, currently {money(sample.currentPrice)}:
          </p>
          <div className="relative h-1.5 rounded-full bg-line" aria-hidden="true">
            <span className="absolute inset-y-0 left-1/4 right-1/4 rounded-full bg-acc-a2" />
            <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-t3" />
          </div>
          <p className="mt-2 flex justify-between font-mono text-[11px]">
            <span className="text-neg">{money(low)}</span>
            <span className="text-t4">current</span>
            <span className="text-pos">{money(high)}</span>
          </p>
        </div>
      )}
    </section>
  );
}
