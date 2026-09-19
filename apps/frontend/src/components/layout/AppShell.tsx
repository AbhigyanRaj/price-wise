import { NavLink, Outlet, useNavigate } from "react-router";
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
} from "lucide-react";
import { useAuth, useSignOut } from "@/features/auth/useAuth";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/products", label: "Catalog", Icon: Boxes },
  { to: "/recommendations", label: "Queue", Icon: ClipboardList },
  { to: "/audit", label: "Audit", Icon: ScrollText },
  { to: "/settings", label: "Settings", Icon: Settings, adminOnly: true },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppShell() {
  const { session, isAdmin } = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();

  // Hiding a nav item is a convenience, not a control. The API rejects an
  // analyst hitting /org/settings regardless of what this renders.
  const visible = NAV.filter((item) => !item.adminOnly || isAdmin);

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <span className="grid h-6 w-6 place-items-center rounded-sm bg-brand text-[11px] font-bold text-brand-ink">
            P
          </span>
          <span className="text-sm font-semibold tracking-tight">Pricewise</span>
        </div>

        <nav className="flex-1 space-y-0.5 p-2" aria-label="Main">
          {visible.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-100",
                  isActive
                    ? // The accent earns its place here: active location is one
                      // of the five things it is allowed to mark.
                      "bg-brand-wash font-medium text-brand"
                    : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn("h-4 w-4", isActive ? "text-brand" : "text-ink-tertiary")}
                    aria-hidden="true"
                  />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-2">
          <div className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-active text-[10px] font-medium text-ink-secondary">
              {initials(session?.user.name ?? "")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{session?.user.name}</p>
              <p className="truncate text-[11px] text-ink-tertiary">
                {session?.user.role === "ADMIN" ? "Admin" : "Pricing Analyst"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-sm p-1 text-ink-tertiary transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-6">
          {/* The organization name sits here deliberately and permanently. It
              is what makes the two-tenant demo legible: switch accounts on
              screen and the change is visible without navigating anywhere. */}
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-sm font-semibold">{session?.organization.name}</h2>
            <span className="tnum font-mono text-[11px] text-ink-tertiary">
              threshold {session?.organization.confidenceThreshold.toFixed(2)}
            </span>
          </div>
          <ThemeToggle />
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
