/**
 * One definition per format. Currency, percentages and dates appear on every
 * screen, and two screens disagreeing about how to round a price is exactly
 * the class of bug this product cannot afford.
 */

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(value: number): string {
  return CURRENCY.format(value);
}

/** Takes a FRACTION (0.106) and renders it as a signed percentage. */
export function deltaPercent(fraction: number, digits = 1): string {
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

/** Takes a fraction and renders it unsigned, for margins and weights. */
export function percent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function confidence(value: number): string {
  return value.toFixed(2);
}

export type ConfidenceBand = "high" | "medium" | "low";

/** Bands mirror CONFIDENCE_BANDS on the server so the queue and the detail
 *  page can never disagree about what counts as high. */
export function confidenceBand(value: number): ConfidenceBand {
  if (value >= 0.85) return "high";
  if (value >= 0.7) return "medium";
  return "low";
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Relative for recency, because "3 hours ago" is what an analyst triaging a
 *  queue actually wants. The absolute value goes in a title attribute. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(seconds);

  if (abs < 60) return RELATIVE.format(Math.round(seconds), "second");
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return RELATIVE.format(Math.round(seconds / 3600), "hour");
  return RELATIVE.format(Math.round(seconds / 86_400), "day");
}

export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Elapsed milliseconds as a compact duration, for agent timers. */
export function duration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}
