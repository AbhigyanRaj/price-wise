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
  test("renders the form and the demo accounts", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/auth/me": { status: 401, body: {} } }));
    renderWithProviders(<LoginPage />);

    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    // The brief wants an evaluator to reach populated data immediately rather
    // than hunting for credentials in a README.
    expect(screen.getByText("admin@northwind.test")).toBeInTheDocument();
  });

  test("a demo account fills both fields", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/auth/me": { status: 401, body: {} } }));
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.click(await screen.findByText("analyst@northwind.test"));

    expect(screen.getByLabelText("Email")).toHaveValue("analyst@northwind.test");
    expect(screen.getByLabelText("Password")).toHaveValue("Pricewise2026!");
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

    await user.click(await screen.findByText("admin@northwind.test"));
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      // The regression this guards: login used to call queryClient.clear(),
      // which wiped the identity query AuthProvider was observing in the same
      // tick it was written, leaving the app on a full-page spinner.
      expect(queryClient.getQueryData(["auth", "session"])).toEqual(SESSION);
    });
  });
});
