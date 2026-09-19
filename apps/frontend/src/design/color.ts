/**
 * sRGB colour maths, used by the contrast test.
 *
 * Implemented rather than pulled in as a dependency because it is thirty lines
 * of published arithmetic, and a contrast assertion that depends on a package
 * is one more thing to explain.
 *
 * Replaces an earlier OKLCH converter. The palette was authored in OKLCH when
 * it was ours; the design handoff specifies hex and rgba, so the conversion
 * needed is hex to sRGB, and the OKLCH code became dead.
 */

export type Rgb = readonly [number, number, number];

/** A colour plus the alpha it was declared with, because a translucent token
 *  is not the colour the eye actually sees. */
export interface ParsedColor {
  rgb: Rgb;
  alpha: number;
}

/** Parses `#rgb`, `#rrggbb`, `rgb(r, g, b)` and `rgba(r, g, b, a)`.
 *  Returns null for anything else, so a gradient or a var() reference is
 *  skipped rather than silently parsed as black. */
export function parseCssColor(value: string): ParsedColor | null {
  const input = value.trim();

  if (input.startsWith("#")) {
    let hex = input.slice(1);
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return null;
    const channel = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
    return { rgb: [channel(0), channel(2), channel(4)], alpha: 1 };
  }

  const fn = /^rgba?\(([^)]+)\)$/i.exec(input);
  if (!fn?.[1]) return null;
  const parts = fn[1].split(",").map((p) => Number(p.trim()));
  const [r, g, b, a] = parts;
  if (r === undefined || g === undefined || b === undefined) return null;
  if ([r, g, b].some(Number.isNaN)) return null;

  return { rgb: [r / 255, g / 255, b / 255], alpha: a === undefined || Number.isNaN(a) ? 1 : a };
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

/** Flattens a translucent colour onto its backdrop. */
export function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((channel, i) => alpha * channel + (1 - alpha) * (bg[i] ?? 0)) as unknown as Rgb;
}
