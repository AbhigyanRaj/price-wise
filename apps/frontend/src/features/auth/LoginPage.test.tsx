import { beforeEach, describe, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "./LoginPage";
import { mockFetch, renderWithProviders } from "@/test/renderWithProviders";

/**
 * These exist because the sign-in screen is the first thing anyone sees and it
 * had never been rendered in a test. A build passing proves the types line up,
 * not that the component mounts.
 */

const SESSION = {
  user: { id: "u1", email: "admin@northwind.test", name: "Ada Admin", role: "ADMIN" },
  organization: { id: "o1", name: "Northwind Retail", confidenceThreshold: 0.8, maxPriceDeltaPct: 0.2 },
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("sign in", () => {
  test("renders the form", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/auth/me": { status: 401, body: {} } }));
    renderWithProviders(<LoginPage />);

    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  test("the seeded credentials are not printed on the sign-in screen", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/auth/me": { status: 401, body: {} } }));
    renderWithProviders(<LoginPage />);
    await screen.findByLabelText("Email");

    // This is the product's front door. The seeded accounts belong in the
    // README, and a credential list here reads as a test harness.
    expect(screen.queryByText(/@northwind\.test/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pricewise2026!/)).not.toBeInTheDocument();
  });

  test("the password can be revealed and hidden again", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/auth/me": { status: 401, body: {} } }));
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    const password = await screen.findByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");

    // The accessible name states the ACTION, so it flips with the state.
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  test("an empty submit is blocked client-side and makes no login request", async () => {
    const fetchMock = mockFetch({ "/auth/me": { status: 401, body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.click(await screen.findByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      // The shared Zod schema is doing the work; if it were not wired the
      // request would go out and the server would reject it instead.
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/auth/login"))).toBe(false);
    });
  });

  test("a rejected sign-in shows the server's message without naming a field", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/auth/me": { status: 401, body: {} },
        "/auth/login": { status: 401, body: { message: "Invalid email or password" } },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(await screen.findByLabelText("Email"), "admin@northwind.test");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    // Deliberately form-level: saying which field was wrong would reveal
    // whether an email is registered.
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid", "true");
  });

  test("a successful sign-in seeds the session rather than refetching it", async () => {
    const fetchMock = mockFetch({
      "/auth/me": { status: 401, body: {} },
      "/auth/login": { body: SESSION },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<LoginPage />);

    await user.type(await screen.findByLabelText("Email"), "admin@northwind.test");
    await user.type(screen.getByLabelText("Password"), "Pricewise2026!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      // The regression this guards: login used to call queryClient.clear(),
      // which wiped the identity query AuthProvider was observing in the same
      // tick it was written, leaving the app on a full-page spinner.
      expect(queryClient.getQueryData(["auth", "session"])).toEqual(SESSION);
    });
  });
});
