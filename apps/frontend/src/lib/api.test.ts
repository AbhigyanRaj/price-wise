import { describe, expect, test, vi, afterEach } from "vitest";
import { api, ApiError, API_BASE } from "./api";

/**
 * The deployment mistake this file exists for: shipping the frontend without
 * VITE_API_URL. API_BASE falls back to the relative "/api", the SPA rewrite
 * answers it with index.html, and every call receives a web page. The message
 * has to name that, because "Something went wrong" sends someone hunting in
 * the wrong repository.
 */
describe("an API that answers with HTML", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("says the API returned HTML, and names the likely cause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<!doctype html><html><body>app shell</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ),
    );

    const err = await api.get("/products").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/returned HTML instead of JSON/i);
    expect((err as ApiError).message).toMatch(/VITE_API_URL/);
  });

  test("a non-JSON body that is not HTML is quoted back when it is short", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("upstream request timeout", {
          status: 504,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );

    const err = (await api.get("/products").catch((e: unknown) => e)) as ApiError;

    expect(err.message).toContain("upstream request timeout");
  });
});

/**
 * A base URL pasted with a trailing slash is the commonest deployment typo
 * there is, and it produced "//auth/me", which Express answers with a 404
 * rather than routing. The failure looks nothing like its cause, so the base
 * normalises instead of trusting whoever filled in the dashboard.
 */
describe("API_BASE normalisation", () => {
  test("has no trailing slash, whatever VITE_API_URL held", () => {
    expect(API_BASE).not.toMatch(/\/$/);
  });

  test("a path appended to it never doubles the separator", () => {
    expect(`${API_BASE}/auth/me`).not.toContain("//auth");
  });
});
