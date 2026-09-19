import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { composite, contrastRatio, parseCssColor, type ParsedColor } from "./color";

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
 * future palette tweak that breaks AA fails the build rather than an audit.
 *
 * It has already earned its place once: it caught the design handoff's light
 * `--pos` at 3.87:1, used for positive delta text.
 *
 * Targets are WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and for
 * non-text UI such as an icon or a border.
 */

/** Pulls every custom property out of one selector block. */
function parseTokens(selector: string): Map<string, ParsedColor> {
  const block = new RegExp(`${selector}\\s*\\{(.*?)\\n\\}`, "s").exec(CSS);
  if (!block?.[1]) throw new Error(`Could not find the ${selector} block in index.css`);

  const tokens = new Map<string, ParsedColor>();
  for (const [, name, value] of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (!name || !value) continue;
    // Shadows, gradients and multi-value tokens are not colours; skip rather
    // than mis-parse them.
    const parsed = parseCssColor(value);
    if (parsed) tokens.set(name, parsed);
  }
  return tokens;
}

const THEMES = {
  // Dark is the default and carries no class; light overrides it.
  dark: parseTokens(":root"),
  light: parseTokens("\\.light"),
};

function ratio(tokens: Map<string, ParsedColor>, foreground: string, background: string): number {
  const fg = tokens.get(foreground);
  const bg = tokens.get(background);
  if (!fg) throw new Error(`Unknown token --${foreground}`);
  if (!bg) throw new Error(`Unknown token --${background}`);

  const flattened = fg.alpha < 1 ? composite(fg.rgb, bg.rgb, fg.alpha) : fg.rgb;
  return contrastRatio(flattened, bg.rgb);
}

const NORMAL_TEXT = 4.5;
const UI_OR_LARGE = 3;

/**
 * Every pair carries the reason it is held to the bar it is held to. The text
 * ramp splits at t4: t0 through t3 carry language a user has to read, so they
 * owe 4.5:1. t4 is de-emphasised metadata and is held to 3:1.
 */
const PAIRS: { fg: string; bg: string; min: number; label: string }[] = [
  { fg: "t0", bg: "bg", min: NORMAL_TEXT, label: "heading on the page" },
  { fg: "t1", bg: "bg", min: NORMAL_TEXT, label: "body text on the page" },
  { fg: "t1", bg: "panel", min: NORMAL_TEXT, label: "body text on a panel" },
  { fg: "t2", bg: "bg", min: NORMAL_TEXT, label: "secondary body on the page" },
  { fg: "t2", bg: "panel", min: NORMAL_TEXT, label: "secondary body on a panel" },
  { fg: "t2", bg: "chrome", min: NORMAL_TEXT, label: "secondary body on chrome" },
  { fg: "t3", bg: "bg", min: NORMAL_TEXT, label: "small text on the page" },
  { fg: "t3", bg: "panel", min: NORMAL_TEXT, label: "small text on a panel" },
  { fg: "t3", bg: "chrome", min: NORMAL_TEXT, label: "small text on chrome" },

  { fg: "t4", bg: "bg", min: UI_OR_LARGE, label: "de-emphasised metadata on the page" },
  { fg: "t4", bg: "panel", min: UI_OR_LARGE, label: "de-emphasised metadata on a panel" },

  // The base accent is an icon, border and fill colour. Accent TEXT uses the
  // tints, which are held to the text bar.
  { fg: "acc", bg: "bg", min: UI_OR_LARGE, label: "accent as a UI component" },
  { fg: "acc2", bg: "bg", min: NORMAL_TEXT, label: "accent text" },
  { fg: "acc-t2", bg: "bg", min: NORMAL_TEXT, label: "accent tint text" },
  { fg: "on-acc", bg: "acc", min: NORMAL_TEXT, label: "button label on the accent" },

  // Semantic colours all appear as text: deltas, margins, statuses.
  { fg: "pos", bg: "bg", min: NORMAL_TEXT, label: "positive delta on the page" },
  { fg: "pos", bg: "panel", min: NORMAL_TEXT, label: "positive delta on a panel" },
  { fg: "neg", bg: "bg", min: NORMAL_TEXT, label: "negative delta on the page" },
  { fg: "neg", bg: "panel", min: NORMAL_TEXT, label: "negative delta on a panel" },
  { fg: "amber", bg: "bg", min: NORMAL_TEXT, label: "caution text on the page" },
  { fg: "amber", bg: "panel", min: NORMAL_TEXT, label: "caution text on a panel" },
];

describe.each(Object.entries(THEMES))("%s theme meets WCAG AA", (_themeName, tokens) => {
  test.each(PAIRS)("$label reaches $min:1", ({ fg, bg, min }) => {
    expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe("palette invariants", () => {
  test("both themes define the same colour tokens", () => {
    // A token defined in one theme and forgotten in the other silently falls
    // back to the other theme's value, which is the classic dark-mode bug.
    expect([...THEMES.light.keys()].sort()).toEqual([...THEMES.dark.keys()].sort());
  });

  test("the dark page background is not pure black", () => {
    // Pure black plus light text haloes, and leaves nowhere to go underneath
    // for a recessed surface. The ladder needs headroom below it.
    expect(THEMES.dark.get("bg")?.rgb.every((channel) => channel > 0.02)).toBe(true);
  });

  test("the dark surface ladder ascends", () => {
    // Elevation in dark comes from a lighter surface rather than a shadow, so
    // this ordering is what makes a panel visible against the page at all.
    const level = (name: string) => THEMES.dark.get(name)?.rgb[0] ?? 0;
    expect(level("panel")).toBeGreaterThan(level("bg"));
    expect(level("raised")).toBeGreaterThan(level("panel"));
    expect(level("inset")).toBeLessThan(level("panel"));
  });

  test("the light surface ladder descends, because paper works the other way", () => {
    const level = (name: string) => THEMES.light.get(name)?.rgb[0] ?? 0;
    expect(level("panel")).toBeGreaterThan(level("bg"));
    expect(level("hover")).toBeLessThan(level("panel"));
  });

  test("semantic colours are retuned per theme rather than reused", () => {
    // The dark positive green fails on paper. A palette that shares one value
    // across both themes has not thought about the light one.
    for (const token of ["pos", "neg", "amber"]) {
      expect(THEMES.light.get(token)?.rgb).not.toEqual(THEMES.dark.get(token)?.rgb);
    }
  });
});

/**
 * Documented exemptions.
 *
 * t5 and t6 sit below every AA bar by construction: they are the faintest two
 * rungs, intended for hairline-adjacent marks and disabled affordances. The
 * handoff also uses t5 for the keyboard-hint strip, which IS informational
 * text at 2.68:1 in dark and 2.37:1 in light. That is a real accessibility
 * weakness and it is recorded here rather than hidden, so the number is
 * visible in the test output and cannot drift further without someone noticing.
 */
describe("known-weak rungs are bounded, not silently forgotten", () => {
  test.each(Object.entries(THEMES))("%s: t5 is faint but not invisible", (_name, tokens) => {
    const value = ratio(tokens, "t5", "bg");
    expect(value).toBeGreaterThan(2.2);
    expect(value).toBeLessThan(NORMAL_TEXT);
  });
});
