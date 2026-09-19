import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { composite, contrastRatio, oklchToSrgb, type Rgb } from "./oklch";

// Read from disk rather than importing. A `?raw` import is served through
// Vite, which hands back Tailwind's COMPILED output, and the authored token
// blocks are exactly what this test needs to inspect.
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/**
 * Accessibility asserted, not claimed.
 *
 * Contrast is the requirement most often written into a spec and least often
 * verified, and it is doubly easy to miss here because a palette that passes in
 * dark can fail in light. This parses the stylesheet that actually ships and
 * checks every meaningful foreground/background pair in BOTH themes, so a
 * future palette tweak that breaks AA fails CI rather than an audit.
 *
 * Targets are WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text and for
 * non-text UI components such as an accent used on icons and borders.
 */

interface Token {
  rgbOnOwnTerms: Rgb;
  alpha: number;
}

/** Pulls `--name: oklch(L C H [/ A])` declarations out of one selector block. */
function parseTokens(selector: string): Map<string, Token> {
  const block = new RegExp(`${selector}\\s*\\{(.*?)\\n\\}`, "s").exec(CSS);
  if (!block?.[1]) throw new Error(`Could not find the ${selector} block in index.css`);

  const tokens = new Map<string, Token>();
  const declaration = /--([\w-]+):\s*oklch\(([^)]+)\)/g;

  for (const [, name, value] of block[1].matchAll(declaration)) {
    if (!name || !value) continue;
    const [coords, alphaPart] = value.split("/");
    const numbers = (coords ?? "").trim().split(/\s+/).map(Number);
    const [l, c, h] = numbers;
    if (l === undefined || c === undefined || h === undefined || numbers.some(Number.isNaN)) {
      continue;
    }
    tokens.set(name, {
      rgbOnOwnTerms: oklchToSrgb(l, c, h),
      alpha: alphaPart ? Number(alphaPart.trim()) : 1,
    });
  }

  return tokens;
}

const THEMES = {
  light: parseTokens(":root"),
  dark: parseTokens("\\.dark"),
};

function ratio(tokens: Map<string, Token>, foreground: string, background: string): number {
  const fg = tokens.get(foreground);
  const bg = tokens.get(background);
  if (!fg) throw new Error(`Unknown token --${foreground}`);
  if (!bg) throw new Error(`Unknown token --${background}`);

  // A translucent token is not the colour the eye sees, so flatten it first.
  const flattened =
    fg.alpha < 1 ? composite(fg.rgbOnOwnTerms, bg.rgbOnOwnTerms, fg.alpha) : fg.rgbOnOwnTerms;

  return contrastRatio(flattened, bg.rgbOnOwnTerms);
}

const BODY_TEXT = 4.5;
const UI_COMPONENT = 3;

const PAIRS: { fg: string; bg: string; min: number; label: string }[] = [
  { fg: "ink", bg: "canvas", min: BODY_TEXT, label: "body text on the page" },
  { fg: "ink", bg: "surface", min: BODY_TEXT, label: "body text on a card" },
  { fg: "ink-secondary", bg: "surface", min: BODY_TEXT, label: "secondary text" },
  { fg: "ink-tertiary", bg: "surface", min: UI_COMPONENT, label: "tertiary metadata" },
  { fg: "brand", bg: "canvas", min: UI_COMPONENT, label: "accent on the page" },
  { fg: "brand", bg: "surface", min: UI_COMPONENT, label: "accent on a card" },
  { fg: "up", bg: "surface", min: BODY_TEXT, label: "price increase text" },
  { fg: "down", bg: "surface", min: BODY_TEXT, label: "price decrease text" },
  { fg: "warn", bg: "surface", min: BODY_TEXT, label: "below-floor warning" },
  { fg: "brand-ink", bg: "brand", min: BODY_TEXT, label: "button label on the accent" },
];

describe.each(Object.entries(THEMES))("%s theme meets WCAG AA", (_themeName, tokens) => {
  test.each(PAIRS)("$label reaches $min:1", ({ fg, bg, min }) => {
    expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe("palette invariants", () => {
  test("both themes define the same token names", () => {
    // A token defined in one theme and forgotten in the other silently falls
    // back to the light value, which is the classic dark-mode bug.
    expect([...THEMES.dark.keys()].sort()).toEqual([...THEMES.light.keys()].sort());
  });

  test("the dark canvas is not pure black", () => {
    // Pure black plus light text haloes, and leaves nowhere to go for a raised
    // surface. The ladder needs headroom underneath it.
    const canvas = THEMES.dark.get("canvas");
    expect(canvas?.rgbOnOwnTerms.every((channel) => channel > 0.05)).toBe(true);
  });

  test("the dark surface sits above the dark canvas", () => {
    // Elevation in dark mode comes from a lighter surface, not a shadow, so
    // this ordering is what makes cards visible at all.
    const canvas = THEMES.dark.get("canvas")?.rgbOnOwnTerms[0] ?? 0;
    const surface = THEMES.dark.get("surface")?.rgbOnOwnTerms[0] ?? 0;
    expect(surface).toBeGreaterThan(canvas);
  });

  test("dark borders are translucent so they read over any surface", () => {
    expect(THEMES.dark.get("line")?.alpha).toBeLessThan(1);
  });
});
