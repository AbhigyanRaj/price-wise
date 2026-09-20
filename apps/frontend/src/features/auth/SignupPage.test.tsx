import { beforeEach, describe, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignupPage } from "./SignupPage";
import { InviteSignupPage } from "./InviteSignupPage";
import { mockFetch, renderWithProviders } from "@/test/renderWithProviders";

const SESSION = {
  user: { id: "u1", email: "founder@acme.test", name: "Ada", role: "ADMIN" },
  organization: { id: "o1", name: "Acme", confidenceThreshold: 0.8, maxPriceDeltaPct: 0.2 },
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("create a workspace", () => {
  test("renders every field the shared schema requires", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/auth/me": { status: 401, body: {} } }));
    renderWithProviders(<SignupPage />);

    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  test("states the password policy before submission, not after", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/auth/me": { status: 401, body: {} } }));
    renderWithProviders(<SignupPage />);

    // PasswordSchema carries three separate refinements and Zod surfaces only
    // the first failure, so a policy revealed one rule at a time costs the user
    // a round trip per rule. WCAG 3.3.2 wants it up front.
    const hint = await screen.findByText(/at least 10 characters/i);
    expect(hint).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(/uppercase/i);
  });

  test("a weak password is blocked client-side and makes no signup request", async () => {
    const fetchMock = mockFetch({ "/auth/me": { status: 401, body: {} } });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithProviders(<SignupPage />);

    await user.type(await screen.findByLabelText("Your name"), "Ada");
    await user.type(screen.getByLabelText("Workspace name"), "Acme");
    await user.type(screen.getByLabelText("Email"), "founder@acme.test");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/auth/signup"))).toBe(false);
    });
  });

  test("a duplicate email lands on the email field, not in a banner", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/auth/me": { status: 401, body: {} },
        "/auth/signup": { status: 409, body: { code: "EMAIL_IN_USE", message: "Already registered" } },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<SignupPage />);

    await user.type(await screen.findByLabelText("Your name"), "Ada");
    await user.type(screen.getByLabelText("Workspace name"), "Acme");
    await user.type(screen.getByLabelText("Email"), "taken@acme.test");
    await user.type(screen.getByLabelText("Password"), "Pricewise2026!");
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    // The first consumer of applyServerErrors. Before it, every server
    // rejection surfaced as one banner and the user had to guess which input
    // was wrong.
    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    });
  });

  test("a successful signup seeds the session", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "/auth/me": { status: 401, body: {} }, "/auth/signup": { body: SESSION } }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<SignupPage />);

    await user.type(await screen.findByLabelText("Your name"), "Ada");
    await user.type(screen.getByLabelText("Workspace name"), "Acme");
    await user.type(screen.getByLabelText("Email"), "founder@acme.test");
    await user.type(screen.getByLabelText("Password"), "Pricewise2026!");
    await user.click(screen.getByRole("button", { name: /create workspace/i }));

    await waitFor(() => {
      expect(queryClient.getQueryData(["auth", "session"])).toEqual(SESSION);
    });
  });
});

describe("join by invite", () => {
  test("prefills the code from the link but never the email", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/auth/me": { status: 401, body: {} } }));
    renderWithProviders(<InviteSignupPage />, { route: "/join?code=abc123def456" });

    // Uppercased: codes come from an uppercase alphabet, so a lowercase paste
    // would otherwise read as invalid.
    expect(await screen.findByLabelText("Invite code")).toHaveValue("ABC123DEF456");
    // The invite is bound to an address on the server. A shareable link that
    // carried the address would hand it to whoever holds the link.
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  test("an invalid code is reported on the code field", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "/auth/me": { status: 401, body: {} },
        "/auth/signup/invite": {
          status: 400,
          body: { code: "INVITE_INVALID", message: "That code is not recognised" },
        },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<InviteSignupPage />, { route: "/join?code=ABC123DEF456" });

    await user.type(await screen.findByLabelText("Your name"), "Colin");
    await user.type(screen.getByLabelText("Email"), "colin@acme.test");
    await user.type(screen.getByLabelText("Password"), "Pricewise2026!");
    await user.click(screen.getByRole("button", { name: /join workspace/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Invite code")).toHaveAttribute("aria-invalid", "true");
    });
  });
});
