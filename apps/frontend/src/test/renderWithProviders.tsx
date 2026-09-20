import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ThemeProvider } from "@/app/theme";
import { AuthProvider } from "@/features/auth/useAuth";
import { ToastProvider } from "@/components/ui/toast";

/**
 * Mounts a component inside the same provider stack the app uses.
 *
 * A screen that renders here but not in the browser is possible; a screen that
 * throws here definitely throws there. That is the point: these tests exist to
 * catch the runtime errors a build cannot, because TypeScript is happy with a
 * component that reads `x.y` on an undefined `x` at runtime.
 *
 * Retries are off and the cache is per-test, so one test cannot see another's
 * data and a failing query fails immediately instead of after three attempts.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  { route = "/" }: { route?: string } = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const result = render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>{ui}</ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

  return { ...result, queryClient };
}

/**
 * Scripts `fetch` by path fragment.
 *
 * Deliberately not MSW. One helper and a lookup table covers what these tests
 * need, and a request this does not recognise fails loudly rather than hanging,
 * which is how an unmocked call should behave in a test.
 */
export function mockFetch(routes: Record<string, { status?: number; body: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = Object.keys(routes).find((fragment) => url.includes(fragment));

    if (!match) {
      throw new Error(`mockFetch: no route matches ${url}`);
    }

    const { status = 200, body } = routes[match]!;
    const envelope =
      status >= 400
        ? { success: false, error: { code: "TEST_ERROR", message: "failed", ...(body as object) } }
        : { success: true, data: body };

    return new Response(JSON.stringify(envelope), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
}
