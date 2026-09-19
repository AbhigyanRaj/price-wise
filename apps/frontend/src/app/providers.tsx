import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api";

/**
 * Created inside a component rather than at module scope, so each mount gets a
 * clean cache. That matters for tests, where a shared client would leak state
 * between cases.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry(failureCount, error) {
              // A 401 or a 403 is an answer, not a transient failure. Retrying
              // one is pointless, and retrying a 401 fights the refresh logic
              // in the API client.
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                return false;
              }
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
