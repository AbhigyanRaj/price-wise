import "@testing-library/jest-dom/vitest";

/**
 * jsdom implements no CSS Object Model media queries, so `window.matchMedia` is
 * simply absent and anything that reads it throws on mount. The theme provider
 * calls it to resolve the "system" preference, which means every component test
 * that renders inside the real provider stack would fail without this.
 *
 * It reports `false` for every query, so a test sees the light theme and, once
 * responsive breakpoints land, the narrow layout. That is worth knowing when
 * reading a failure: a component that branches on a media query is exercising
 * its small-viewport branch here.
 */
/**
 * jsdom has no canvas implementation, so `getContext` returns null after
 * routing a "Not implemented" jsdomError to the console. PixelField already
 * treats a null context as "no canvas here" and returns before it touches
 * anything else, so the behaviour is correct either way; this only stops
 * twelve lines of stderr from burying a real failure.
 *
 * A prototype assignment rather than vi.stubGlobal, deliberately: the suites
 * call vi.unstubAllGlobals() in beforeEach, which would undo a stub.
 */
HTMLCanvasElement.prototype.getContext = () => null;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    // Deprecated, but React and several libraries still feature-detect them.
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
