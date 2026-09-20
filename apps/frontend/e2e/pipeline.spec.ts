import { expect, test, type Page } from "@playwright/test";

/**
 * The journey this product exists for, end to end in a real browser.
 *
 * What this proves that the other 244 tests cannot: that the shell, the
 * router, the cookie handling, the query cache and the API compose. Every
 * layer below is already covered in isolation.
 */

const ADMIN = { email: "admin@northwind.test", password: "Pricewise2026!" };
const ANALYST = { email: "analyst@northwind.test", password: "Pricewise2026!" };

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  // exact, because the show/hide toggle beside the field is labelled
  // "Show password" and a substring match resolves to both.
  await page.getByLabel("Email", { exact: true }).fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // The rail only exists once authenticated, so this is the honest signal
  // that sign-in actually completed rather than merely returning 200.
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

test.describe("the decision journey", () => {
  test("an analyst signs in, reads the reasoning, and approves", async ({ page }) => {
    await signIn(page, ANALYST);

    // The organization name is in the top bar permanently. It is what makes
    // the two-tenant story visible without navigating anywhere.
    // Scoped to the banner: the Overview heading is the org name too, and an
    // unscoped match would be ambiguous rather than wrong.
    await expect(page.getByRole("banner").getByText("Northwind Retail")).toBeVisible();

    await page.getByRole("link", { name: "Decisions" }).click();
    await expect(page).toHaveURL(/\/decisions$/);

    const firstRow = page.getByRole("listitem").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    await expect(page).toHaveURL(/\/decisions\/[0-9a-f-]{36}$/);

    // The rationale is the thing a human actually reads, so it is the thing
    // worth asserting is present.
    await expect(page.getByRole("heading", { name: /why this price/i })).toBeVisible();

    // Every agent that ran is listed, with the tool calls that produced it.
    await expect(page.getByText(/market intelligence/i)).toBeVisible();

    // Some seeded recommendations are deliberately blocked by a business rule,
    // which is its own valid outcome but is not this journey. Walk the queue
    // until one is actually approvable, which is what an analyst does too.
    //
    // Undo and the alert are each absent until their outcome happens, so
    // polling for whichever appears distinguishes the two without racing.
    const undo = page.getByRole("button", { name: /^undo$/i });
    const alert = page.getByRole("alert");

    async function outcome() {
      if ((await undo.count()) > 0) return "approved";
      if ((await alert.count()) > 0) return "blocked";
      return "pending";
    }

    let approved = false;

    for (let attempt = 0; attempt < 5 && !approved; attempt++) {
      const before = page.url();
      await page.getByRole("button", { name: /^approve$/i }).click();
      await expect.poll(outcome, { timeout: 15_000 }).not.toBe("pending");

      if ((await outcome()) === "approved") {
        approved = true;
        // Approving advances to the next decision rather than emptying the
        // pane: the analyst's job is a sequence.
        await expect(page).not.toHaveURL(before);
      } else {
        // Blocked. The refusal has to name a reason, not just say it failed.
        await expect(alert).toContainText(/rule|margin|floor|cost|blocked/i);
        // J moves to the next decision and clears the error on the way.
        await page.keyboard.press("j");
        await expect(page).not.toHaveURL(before);
        await expect(alert).toHaveCount(0);
      }
    }

    expect(approved, "no pending recommendation could be approved").toBe(true);
  });

  test("the command palette opens on the keyboard and navigates", async ({ page }) => {
    await signIn(page, ANALYST);

    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();

    await palette.getByRole("button", { name: /products/i }).first().click();
    await expect(page).toHaveURL(/\/products$/);
  });

  test("an analyst cannot reach settings, an admin can", async ({ page }) => {
    await signIn(page, ANALYST);
    // Client-side gating is UX only, but it should still hide the affordance.
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);

    // And typing the URL lands on a refusal rather than a broken screen.
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /not available to your role/i })).toBeVisible();
    // The refusal is the whole screen, not a banner above a usable form.
    await expect(page.getByRole("button", { name: /save/i })).toHaveCount(0);

    // Sign out first: an authenticated user asking for /login is redirected
    // home, so going there without signing out would never show the form.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, ADMIN);
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("an unknown route shows the not-found state, not a blank screen", async ({ page }) => {
    await signIn(page, ANALYST);
    await page.goto("/does-not-exist");

    await expect(page.getByText(/nothing at this address/i)).toBeVisible();
    // The rail survives, so the user can navigate out rather than hitting back.
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  });

  test("both themes render and the choice survives a reload", async ({ page }) => {
    await signIn(page, ANALYST);

    await page.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveClass(/light/);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/light/);

    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
