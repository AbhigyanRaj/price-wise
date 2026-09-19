// A seeded PRNG so the demo is reproducible: the same seed always produces the
// same catalog, which means a planted scenario cannot silently drift between
// runs and "watch this SKU" still works during the interview.
// mulberry32, 32-bit, tiny, good enough for generating plausible data.

export function createRng(seed: number) {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    /** Uniform float in [min, max). */
    between: (min: number, max: number) => min + next() * (max - min),
    /** Uniform integer in [min, max]. */
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    /** Approximately normal, via the sum of 3 uniforms (Bates). Good enough for
     *  price drift, and avoids the heavy tails of a naive uniform walk. */
    normal: (mean: number, stdDev: number) => {
      const u = (next() + next() + next()) / 3;
      return mean + (u - 0.5) * 2 * Math.sqrt(3) * stdDev;
    },
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("pick() called on an empty array");
      return item;
    },
    chance: (probability: number) => next() < probability,
  };
}

export type Rng = ReturnType<typeof createRng>;

export const round2 = (n: number) => Math.round(n * 100) / 100;
