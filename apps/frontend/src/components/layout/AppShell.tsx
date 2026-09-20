import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { useAuth, useSignOut } from "@/features/auth/useAuth";
import { usePendingCount } from "@/features/recommendations/usePendingCount";
import { CommandPalette } from "@/components/command/CommandPalette";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";

export function AppShell() {
  const { session, isAdmin } = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const pendingCount = usePendingCount();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Bound at the shell rather than inside the palette, so the shortcut works
  // from every screen including ones that have their own key handlers.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    // h-dvh, NOT min-h-dvh.
    //
    // A minimum let the shell grow with its content, and a flex row stretches
    // its items to the row's height, so on a long page the rail became as tall
    // as the whole scrolled document. `mt-auto` then pinned sign-out to the
    // bottom of a two-thousand-pixel rail, which is well below the fold: the
    // button looked correctly placed on Overview and vanished on Products and
    // Settings. Nothing was conditionally rendered, it was just off screen.
    //
    // A definite height also makes `main` the scroll container, which is what
    // `overflow-y-auto` there always intended. Previously the window scrolled
    // and that rule did nothing.
    <div className="noise flex h-dvh flex-col bg-bg text-t1">
      <TopBar
        session={session}
        pendingCount={pendingCount}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Rail isAdmin={isAdmin} pendingCount={pendingCount} onSignOut={handleSignOut} />
        {/* min-h-0 is load-bearing: a flex item's default min-height is auto,
            which refuses to shrink below its content, and overflow-y-auto on a
            box that never shrinks can never scroll. */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        isAdmin={isAdmin}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
