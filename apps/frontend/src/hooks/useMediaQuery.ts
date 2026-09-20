import { useCallback, useSyncExternalStore } from "react";

/**
 * Reports whether a media query currently matches.
 *
 * useSyncExternalStore rather than useState plus useEffect, deliberately: the
 * effect version renders the non-matching branch first and corrects it after
 * paint, so a desktop user would see the mobile layout flash on every load.
 * This reads synchronously on first render.
 *
 * The server snapshot returns false. There is no SSR here, but jsdom has no
 * matchMedia either, so a component test always exercises the non-matching
 * branch. Worth knowing when reading a test failure: anything gated on a
 * min-width query is running its narrow-viewport path under vitest.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The single breakpoint the responsive strategy turns on. Below it the app is
 *  a phone app; at and above it nothing differs from before. */
export const MD = "(min-width: 768px)";

/** The two-pane decisions layout needs this, not MD. Measured: at 768 the rail
 *  (64) and the queue (376) leave 328 for the detail pane, and the price row
 *  alone overflows it by about 30px. */
export const LG = "(min-width: 1024px)";
