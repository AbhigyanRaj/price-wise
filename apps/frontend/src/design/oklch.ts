/**
 * OKLCH to sRGB, used by the contrast test.
 *
 * The palette is authored in OKLCH because L is perceptual: fixing L per
 * contrast tier and rotating H gives a semantic set whose members all read at
 * the same brightness. Verifying that claim needs a conversion back to sRGB,
 * which is what this does. Implemented rather than pulled in as a dependency
 * because it is twenty lines of published matrix arithmetic.
 *
 * Reference: Björn Ottosson's Oklab, plus the sRGB transfer function.
 */

export type Rgb = readonly [number, number, number];

export function oklchToSrgb(l: number, c: number, hDegrees: number): Rgb {
  const h = (hDegrees * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const lCubed = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCubed = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCubed = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed,
    -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed,
    -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed,
  ] as const;

  return linear.map(encodeSrgb) as unknown as Rgb;
}

function encodeSrgb(channel: number): number {
  const u = Math.min(1, Math.max(0, channel));
  return u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (u: number) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.1 contrast ratio, between 1 and 21. */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Flattens a translucent colour onto its backdrop. A token like
 *  `oklch(... / 0.12)` is not the colour the eye actually sees. */
export function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((channel, i) => alpha * channel + (1 - alpha) * (bg[i] ?? 0)) as unknown as Rgb;
}
