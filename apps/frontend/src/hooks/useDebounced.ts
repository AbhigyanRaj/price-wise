import { useEffect, useState } from "react";

/**
 * Trails a value by a delay.
 *
 * Used to keep an input responsive while the query key it feeds settles: the
 * field holds its own immediate state, and only the debounced copy goes into
 * the cache key, so typing does not fire a request per keystroke.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
