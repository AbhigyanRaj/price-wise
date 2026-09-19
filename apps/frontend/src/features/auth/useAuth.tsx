import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import { api, ApiError } from "@/lib/api";
import type { SessionDto } from "@/lib/types";

/**
 * Identity only. Deliberately thin: this holds who the user is, not the
 * server data they are looking at. Everything else belongs in a query keyed by
 * its own resource, so a stale catalog cannot invalidate the session.
 */

interface AuthValue {
  session: SessionDto | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** UX only. The API enforces the same rule independently, and hiding a
   *  control is not access control. */
  isAdmin: boolean;
  refetch: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export const SESSION_QUERY_KEY = ["auth", "session"] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.get<SessionDto>("/auth/me"),
    // A 401 here is the answer to "am I logged in", not a failure worth
    // retrying. Retrying would also delay the redirect to the login page.
    retry: false,
    staleTime: 5 * 60_000,
  });

  const value = useMemo<AuthValue>(
    () => ({
      session: data ?? null,
      isLoading,
      isAuthenticated: Boolean(data?.user),
      isAdmin: data?.user.role === "ADMIN",
      refetch: () => void refetch(),
    }),
    [data, isLoading, refetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/** Clears every cached query on sign out. Without this the next user to sign
 *  in on the same browser briefly sees the previous tenant's data from cache,
 *  which in a multi-tenant product is the worst bug available. */
export function useSignOut() {
  const queryClient = useQueryClient();

  return async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      // An already-expired session still ends here. Nothing to report.
      if (!(error instanceof ApiError)) throw error;
    } finally {
      queryClient.clear();
    }
  };
}
