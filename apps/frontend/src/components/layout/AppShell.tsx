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
    <div className="noise flex min-h-dvh flex-col bg-bg text-t1">
      <TopBar
        session={session}
        pendingCount={pendingCount}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <Rail isAdmin={isAdmin} pendingCount={pendingCount} onSignOut={handleSignOut} />
        <main className="min-w-0 flex-1 overflow-y-auto">
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
