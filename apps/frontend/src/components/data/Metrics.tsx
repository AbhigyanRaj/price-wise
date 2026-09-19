import { ArrowDown, ArrowUp, Minus, TriangleAlert } from "lucide-react";
import type { RecStatus } from "@pricewise/shared";
import { confidenceBand, deltaPercent, money, percent } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The shared vocabulary for displaying a number that carries meaning.
 *
 * Every one of these pairs colour with a second, non-colour signal: an arrow,
 * a glyph, or the number itself. Roughly one in twelve men has a red/green
 * colour vision deficiency, and price direction is the single most important
 * thing on these screens, so hue alone is not an acceptable encoding
 * (NFR-A4).
 */

/** Price movement. Carries an arrow AND a signed percentage, never just hue. */
export function DeltaChip({
  fraction,
  className,
}: {
  fraction: number;
  className?: string | undefined;
}) {
  if (Math.abs(fraction) < 0.0005) {
    return (
      <span className={cn("tnum inline-flex items-center gap-1 text-ink-tertiary", className)}>
        <Minus className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">No change</span>
        0.0%
      </span>
    );
  }

  const isUp = fraction > 0;
  const Icon = isUp ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-0.5 font-medium",
        isUp ? "text-up" : "text-down",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">{isUp ? "Increase of" : "Decrease of"}</span>
      {deltaPercent(fraction)}
    </span>
  );
}

/**
 * Confidence, always with its numeric value visible.
 *
 * Bands are the same thresholds the server uses, so the queue's colour and the
 * detail page's waterfall cannot disagree about what counts as high.
 */
export function ConfidenceBadge({
  value,
  className,
}: {
  value: number;
  className?: string | undefined;
}) {
  const band = confidenceBand(value);

  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs font-medium",
        band === "high" && "bg-up-wash text-up",
        band === "medium" && "bg-warn-wash text-warn",
        band === "low" && "bg-down-wash text-down",
        className,
      )}
      title={`${band} confidence`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {value.toFixed(2)}
    </span>
  );
}

export function InventoryBadge({
  status,
  level,
}: {
  status: "LOW" | "NORMAL" | "OVERSTOCKED";
  level: number;
}) {
  const label = status === "LOW" ? "Low" : status === "OVERSTOCKED" ? "Overstocked" : "Normal";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tnum text-ink">{level.toLocaleString()}</span>
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
          status === "LOW" && "bg-warn-wash text-warn",
          status === "OVERSTOCKED" && "bg-brand-wash text-brand",
          status === "NORMAL" && "text-ink-tertiary",
        )}
      >
        {label}
      </span>
    </span>
  );
}

const STATUS_LABELS: Record<RecStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  MODIFIED: "Modified",
  AUTO_EXECUTED: "Auto-executed",
  FAILED: "Failed",
};

export function StatusBadge({ status }: { status: RecStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
        status === "PENDING" && "bg-warn-wash text-warn",
        (status === "APPROVED" || status === "AUTO_EXECUTED") && "bg-up-wash text-up",
        (status === "REJECTED" || status === "FAILED") && "bg-down-wash text-down",
        status === "MODIFIED" && "bg-brand-wash text-brand",
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Margin, flagged when it sits below the product's configured floor. The
 *  warning is an icon as well as a colour, and carries a title for hover. */
export function MarginCell({ margin, belowFloor }: { margin: number; belowFloor: boolean }) {
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1",
        belowFloor ? "text-warn" : "text-ink-secondary",
      )}
    >
      {belowFloor && (
        <TriangleAlert className="h-3.5 w-3.5" aria-label="Below the margin floor" />
      )}
      {percent(margin, 1)}
    </span>
  );
}

/** Prices are mono and tabular so a column of them aligns on the decimal. */
export function Money({ value, className }: { value: number; className?: string | undefined }) {
  return <span className={cn("tnum font-mono", className)}>{money(value)}</span>;
}
