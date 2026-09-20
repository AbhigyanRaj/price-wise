import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ApiError } from "@/lib/api";
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
        // Each recommendation is one 3px tick POSITIONED BY ITS CONFIDENCE,
        // not a bar in a row of equal columns. The previous version gave every
        // bar `flex-1`, so with thirteen recommendations they rendered as wide
        // blocks that read as a bar chart of thirteen categories. It is a
        // distribution: the horizontal axis is confidence, it shares that axis
        // with the slider directly beneath, and dragging the handle recolours
        // the ticks it passes.
        <div className="relative mb-1 h-14" aria-hidden="true">
          {recent.map((rec) => (
            <span
              key={rec.id}
              title={`${rec.product?.sku} at ${rec.confidenceScore.toFixed(2)}`}
              className={cn(
                "absolute bottom-0 w-[3px] -translate-x-1/2 rounded-[1px] transition-colors duration-[110ms]",
                rec.confidenceScore >= value ? "bg-acc" : "bg-line3",
              )}
              style={{
                // Clamped into the track, so a 0.50 and a 1.00 both sit fully
                // inside the box rather than half outside it.
                left: `${Math.min(99, Math.max(1, ((rec.confidenceScore - 0.5) / 0.5) * 100))}%`,
                height: `${Math.max(14, ((rec.confidenceScore - 0.5) / 0.5) * 100)}%`,
              }}
            />
          ))}
        </div>
      )}

      <Slider
        min={0.5}
        max={1}
        step={0.01}
        value={value}
        onChange={onChange}
        label="Confidence threshold"
        valueText={`${value.toFixed(2)}, ${wouldExecute.length} of ${recent.length} would execute automatically`}
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

      <Slider
        min={0.05}
        max={0.4}
        step={0.01}
        value={value}
        onChange={onChange}
        label="Maximum price change"
        valueText={`plus or minus ${Math.round(value * 100)} percent`}
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

/**
 * Owns the two sliders and their save.
 *
 * A separate component on purpose, mounted by SettingsPage only once the
 * organization is known and keyed on its id. Holding this state in the page
 * meant the useState initialisers ran on the first render, before the session
 * resolved, so the sliders sat on the defaults for ever: an organization whose
 * saved threshold was 0.75 was shown 0.80, and saving would silently write the
 * wrong value back. Keying on the id also stops one tenant's unsaved slider
 * position appearing on another tenant's screen.
 */
export function RiskControls({
  org,
  recent,
  sample,
  onSaved,
}: {
  org: { confidenceThreshold: number; maxPriceDeltaPct: number };
  recent: RecommendationDto[];
  sample: { name: string; currentPrice: number } | null;
  onSaved: (patch: { confidenceThreshold: number; maxPriceDeltaPct: number }) => Promise<void>;
}) {
  const [threshold, setThreshold] = useState(org.confidenceThreshold);
  const [maxDelta, setMaxDelta] = useState(org.maxPriceDeltaPct);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const dirty = threshold !== org.confidenceThreshold || maxDelta !== org.maxPriceDeltaPct;

  async function save() {
    setStatus("saving");
    setMessage(null);
    try {
      await onSaved({ confidenceThreshold: threshold, maxPriceDeltaPct: maxDelta });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof ApiError ? err.message : "Could not save. Please try again.");
    }
  }

  return (
    <>
      <ThresholdControl value={threshold} onChange={setThreshold} recent={recent} />
      <DeltaControl value={maxDelta} onChange={setMaxDelta} sample={sample} />

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={status === "saving" || !dirty}>
          {status === "saving" ? "Saving" : "Save changes"}
        </Button>
        {/* One alert, not two. The message belongs beside the control that
            failed rather than in a banner at the top of a long page. */}
        {status === "saved" && <span className="text-[12px] text-pos">Saved</span>}
        {status === "error" && message && (
          <span role="alert" className="text-[12px] text-neg">
            {message}
          </span>
        )}
        {status === "idle" && !dirty && (
          <span className="text-[12px] text-t5">No unsaved changes</span>
        )}
      </div>
    </>
  );
}
