import { defineConfig, devices } from "@playwright/test";

/**
 * One end-to-end spec, covering the journey the product exists for: sign in,
 * find a decision, read why it was made, act on it.
 *
 * Deliberately one spec rather than a suite. The unit and integration tests
 * already cover branches and endpoints; what they cannot prove is that the
 * pieces compose in a browser. A second and third spec would re-cover ground
 * at ten times the runtime, which is why two of the three planned specs were
 * cut on day one.
 */
export default defineConfig({
  testDir: "./e2e",
  // Serial. The specs act on shared seed data, and a parallel run would have
  // two workers approving the same recommendation and racing each other.
  workers: 1,
  fullyParallel: false,
  // One retry locally, two in CI: an LLM call sits in the middle of this
  // journey and the free tier occasionally queues.
  retries: process.env.CI ? 2 : 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Reuse a server that is already up, so an interactive run does not fight
  // the dev server the developer is already looking at.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun run dev",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
