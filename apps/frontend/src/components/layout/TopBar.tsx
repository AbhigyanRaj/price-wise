import { useNavigate } from "react-router";
import { Search } from "lucide-react";
import { Mark } from "@/components/brand/Mark";
import { ThemeControl } from "./ThemeControl";
import { cn } from "@/lib/cn";
import type { SessionDto } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * 46px top bar.
 *
 * The workspace name sits here permanently and deliberately: it is what makes
 * the two-tenant story legible, because switching accounts changes something
 * visible without navigating anywhere.
 */
export function TopBar({
  session,
  pendingCount,
  onOpenPalette,
}: {
  session: SessionDto | null;
  pendingCount: number;
  onOpenPalette: () => void;
}) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-[46px] shrink-0 items-center border-b border-line bg-chrome">
      <div className="grid w-11 shrink-0 place-items-center md:w-16">
        <Mark />
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <span className="truncate text-[12.5px] font-semibold text-t0">
          {session?.organization.name}
        </span>
        <span aria-hidden="true" className="hidden h-3.5 w-px bg-line sm:block" />
        <span className="hidden items-center gap-1.5 sm:flex">
          {/* Slow enough to read as "live" rather than as something demanding
              attention. */}
          <span className="pw-breathe h-[5px] w-[5px] rounded-full bg-pos" aria-hidden="true" />
          <span className="font-mono text-[10.5px] text-t3">production</span>
        </span>
      </div>

      <div className="flex flex-1 justify-center px-2 md:px-6">
        <button
          type="button"
          onClick={onOpenPalette}
          // Collapses to an icon button below md: a keyboard shortcut is
          // useless on a phone, but this is the only discovery affordance, so
          // it stays reachable rather than hiding.
          aria-label="Search"
          aria-keyshortcuts="Meta+K Control+K"
          className="flex h-8 w-8 items-center justify-center gap-2 rounded-md border border-line bg-input transition-colors duration-[110ms] hover:border-line3 md:h-[27px] md:w-full md:max-w-[400px] md:justify-start md:px-2.5 md:text-left"
        >
          <Search size={12} strokeWidth={1.4} className="shrink-0 text-t4" aria-hidden="true" />
          <span className="hidden flex-1 truncate text-[11.5px] text-t4 md:block">
            Search products, decisions, activity
          </span>
          <kbd aria-hidden="true" className="keycap hidden shrink-0 md:inline-block">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2.5 pr-2 md:pr-3.5">
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={() => navigate("/decisions")}
            className={cn(
              "hidden items-center gap-1.5 rounded-md border border-acc-border bg-acc-a px-2 py-1 md:flex",
              "text-[11.5px] font-medium text-acc-t2 transition-colors duration-[110ms] hover:bg-acc-a2",
            )}
          >
            <span className="h-[5px] w-[5px] rounded-full bg-acc2" aria-hidden="true" />
            <span className="tnum">{pendingCount}</span> awaiting you
          </button>
        )}

        <span aria-hidden="true" className="hidden h-3.5 w-px bg-line md:block" />
        <ThemeControl />

        <span
          className="grid h-[22px] w-[22px] place-items-center rounded-md bg-avatar-bg text-[10px] font-semibold text-t2"
          title={`${session?.user.name} · ${session?.user.role === "ADMIN" ? "Admin" : "Pricing Analyst"}`}
        >
          {initials(session?.user.name ?? "")}
        </span>
      </div>
    </header>
  );
}
