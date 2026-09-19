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
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
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
    await expect(page.getByText("Northwind Retail")).toBeVisible();

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

    await page.getByRole("button", { name: /^approve$/i }).click();

    // Resolving takes it out of the pending queue.
    await expect(page.getByText(/resolved|cannot be actioned again/i)).toBeVisible({
      timeout: 15_000,
    });
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
    await expect(page.getByText(/only an admin|not allowed|forbidden/i)).toBeVisible();

    await page.goto("/login");
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
