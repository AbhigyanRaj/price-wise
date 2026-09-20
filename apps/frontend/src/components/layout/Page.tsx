import { cn } from "@/lib/cn";

/**
 * One page shell, adopted by every screen behind the rail.
 *
 * It exists because the five screens were built at different times and each
 * invented its own chrome: Overview used `px-[34px] py-7`, Products and
 * Activity used `p-4 md:p-6`, Settings used a third thing. Their headings
 * disagreed too, one at 27px over a 12.5px sub-line and the next at 27px over
 * a 14px one. None of it was a decision, and the drift is visible the moment
 * you move between two tabs.
 *
 * The gutter is 34px, which is the figure the design handoff specifies.
 */
export function Page({
  title,
  subtitle,
  actions,
  children,
  /** Opts out of the centred measure for a screen that owns the full width,
   *  such as a table that should run to the edge of the viewport. */
  wide = false,
  className,
}: {
  title: string;
  subtitle?: string | undefined;
  /** Right-aligned controls on the title row. */
  actions?: React.ReactNode | undefined;
  children: React.ReactNode;
  wide?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("px-4 py-5 md:px-[34px] md:py-7", className)}>
      <header className="pw-rise mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1>{title}</h1>
          {subtitle && (
            <p className="mt-1 max-w-[62ch] text-[12.5px] leading-[1.6] text-t3">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>

      {/* One beat behind the header, so the page resolves top-down rather
          than everything appearing at once. */}
      <div className={cn("pw-rise", !wide && "max-w-[1400px]")} style={{ "--pw-delay": "60ms" } as React.CSSProperties}>
        {children}
      </div>
    </div>
  );
}

/**
 * A bordered block with an optional header row.
 *
 * Every screen was hand-rolling `rounded-card border border-line bg-panel`
 * with a slightly different header padding each time.
 */
export function Section({
  title,
  actions,
  children,
  className,
  /** Removes the body padding, for a section whose child is a table or a list
   *  that should touch the border. */
  flush = false,
}: {
  title?: string | undefined;
  actions?: React.ReactNode | undefined;
  children: React.ReactNode;
  className?: string | undefined;
  flush?: boolean | undefined;
}) {
  return (
    <section className={cn("overflow-hidden rounded-card border border-line bg-panel", className)}>
      {title && (
        <div className="flex h-10 items-center justify-between gap-3 border-b border-line px-4">
          <h3 className="truncate">{title}</h3>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </section>
  );
}
