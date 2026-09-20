import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { Boxes, Gauge, ListChecks, LogOut, ScrollText, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

export interface RailItem {
  to: string;
  label: string;
  Icon: typeof Gauge;
  adminOnly?: boolean;
  badge?: number;
}

export const RAIL_ITEMS: RailItem[] = [
  { to: "/", label: "Overview", Icon: Gauge },
  { to: "/products", label: "Products", Icon: Boxes },
  // ListChecks, not Sparkles. This screen is a queue a human works
  // through and signs off; a sparkle says "magic happened here", which is
  // both the wrong promise and the visual cliche of every AI product
  // shipped since 2023.
  { to: "/decisions", label: "Decisions", Icon: ListChecks },
  { to: "/activity", label: "Activity", Icon: ScrollText },
  { to: "/settings", label: "Settings", Icon: Settings, adminOnly: true },
];

/**
 * 64px icon rail.
 *
 * The accent bar that rides the active item is the only nav affordance that
 * moves, which is what makes it read as position rather than decoration. It is
 * driven off the measured offset of the active link instead of a CSS-only
 * trick, because the item count changes with role: an analyst has no Settings
 * row, and a hardcoded index would point at the wrong one.
 */
export function Rail({
  isAdmin,
  pendingCount,
  onSignOut,
}: {
  isAdmin: boolean;
  pendingCount: number;
  onSignOut: () => void;
}) {
  // Hiding a nav item is a convenience, not a control. The API rejects an
  // analyst hitting /org/settings regardless of what this renders.
  const items = RAIL_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; visible: boolean }>({
    top: 0,
    visible: false,
  });
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    function measure() {
      const nav = navRef.current;
      const active = nav?.querySelector<HTMLElement>("[data-active='true']");
      if (!nav || !active) {
        setIndicator((prev) => ({ ...prev, visible: false }));
        return;
      }
      // Centre a 24px bar on the 52px item.
      setIndicator({ top: active.offsetTop + (active.offsetHeight - 24) / 2, visible: true });
    }

    measure();
    // Without this, crossing the breakpoint without navigating leaves the bar
    // at its last measured position, which after a row layout is 0: parked on
    // the first item. Reviewers resize windows.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [pathname, items.length]);

  return (
    <aside
      className={cn(
        // A bottom tab bar below md, the 64px rail at and above it. One nav
        // element either way: a second, hidden one would break the e2e spec's
        // strict role matcher, and duplicate the landmark for a screen reader.
        "flex w-full shrink-0 flex-row items-center border-t border-line bg-chrome",
        "order-last pb-[env(safe-area-inset-bottom)]",
        "md:order-none md:w-16 md:flex-col md:border-r md:border-t-0 md:pb-0",
      )}
    >
      <nav ref={navRef} aria-label="Main" className="relative flex w-full flex-row md:flex-col md:pt-2">
        <span
          aria-hidden="true"
          className={cn(
            // Hidden below md: in a row layout every offsetTop is 0, so the
            // measurement is meaningless and the bar would sit on the first item.
            "absolute left-0 hidden h-6 w-0.5 rounded-r-sm bg-acc2 transition-[top,opacity] duration-[220ms] md:block",
            indicator.visible ? "opacity-100" : "opacity-0",
          )}
          style={{ top: indicator.top, transitionTimingFunction: "var(--ease-spatial)" }}
        />

        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "relative flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 transition-colors duration-[110ms]",
                "md:w-full md:flex-initial",
                isActive ? "text-t0" : "text-t4 hover:text-t1",
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Read by the indicator effect above, so the bar follows the
                    router rather than a second source of truth. */}
                <span data-active={isActive} className="contents" />
                {/* The mobile equivalent of the sliding rail indicator. Static,
                    so reduced motion is a non-issue. */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 top-0 h-0.5 rounded-b-sm bg-acc2 md:hidden"
                  />
                )}
                <span className="relative">
                  <Icon size={16} strokeWidth={1.2} aria-hidden="true" />
                  {to === "/decisions" && pendingCount > 0 && (
                    <span
                      className="tnum absolute -right-2.5 -top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-[7px] bg-acc px-1 font-mono text-[9px] font-medium text-on-acc"
                      aria-hidden="true"
                    >
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </span>
                <span className="text-[9.5px] leading-none">{label}</span>
                {to === "/decisions" && pendingCount > 0 && (
                  <span className="sr-only">{pendingCount} awaiting a decision</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={onSignOut}
        aria-label="Sign out"
        title="Sign out"
        className="grid h-[52px] w-12 shrink-0 place-items-center border-l border-line text-t4 transition-colors duration-[110ms] hover:bg-hover hover:text-t1 md:mb-3 md:mt-auto md:h-9 md:w-9 md:rounded-md md:border-l-0"
      >
        <LogOut size={16} strokeWidth={1.2} aria-hidden="true" />
      </button>
    </aside>
  );
}
