import { cn } from "@/lib/cn";

/** Beyond this the bar pins and the number carries the magnitude. Without a
 *  clamp one outlier at +300% flattens every other row to invisibility. */
const CLAMP = 0.25;

/**
 * Where this price sits against the market, as one glyph.
 *
 * A 56px track with a centre tick: the bar grows left when we are under the
 * competitor median and right when we are over it. The point is scanning, not
 * precision. Reading one column tells you the competitive position of the
 * whole catalogue, which a column of signed percentages does not.
 *
 * The number sits beside it and carries the actual value, so the bar is never
 * the only source of the information and a pinned bar is still readable.
 */
export function GapCell({ ours, market }: { ours: number; market: number | null }) {
  if (market === null || market <= 0) {
    return <span className="text-[11px] text-t6">no market data</span>;
  }

  const gap = (ours - market) / market;
  const magnitude = Math.min(Math.abs(gap), CLAMP) / CLAMP;
  const above = gap > 0;
  const pinned = Math.abs(gap) > CLAMP;

  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="relative inline-block h-[10px] w-14 shrink-0"
        title={`${above ? "Above" : "Below"} the ${market.toFixed(2)} market median`}
      >
        {/* The tick is the zero line. Without it a bar means nothing. */}
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-line3" />
        <span
          className={cn(
            "absolute top-1/2 h-1 -translate-y-1/2 rounded-[1px]",
            above ? "left-1/2 bg-pos" : "right-1/2 bg-neg",
            // A pinned bar reaches the edge; squaring that end signals "at
            // least this much" rather than "exactly this much".
            pinned && (above ? "rounded-r-none" : "rounded-l-none"),
          )}
          style={{ width: `${magnitude * 50}%` }}
        />
      </span>
      <span
        className={cn(
          "tnum w-14 shrink-0 text-right font-mono text-[11px]",
          Math.abs(gap) < 0.02 ? "text-t4" : above ? "text-pos" : "text-neg",
        )}
      >
        {above ? "+" : "−"}
        {(Math.abs(gap) * 100).toFixed(1)}%
      </span>
    </span>
  );
}
