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
  /** Set when the identity check failed for a reason that is NOT "signed out".
   *  Callers must not treat this as a sign-out. */
  error: ApiError | null;
  refetch: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export const SESSION_QUERY_KEY = ["auth", "session"] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error, refetch } = useQuery<SessionDto | null, ApiError>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.get<SessionDto>("/auth/me"),
    // A 401 is the answer to "am I logged in", not a failure: retrying it would
    // only delay the redirect to the login page. Anything else IS a failure,
    // and the identity query is the one query in the app where failing closed
    // means throwing the user out of a session they still hold. A 429 or a
    // dropped connection gets three backed-off attempts before we conclude
    // anything.
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 3,
    retryDelay: (count) => Math.min(1000 * 2 ** count, 8000),
    staleTime: 5 * 60_000,
  });

  const value = useMemo<AuthValue>(
    () => ({
      session: data ?? null,
      isLoading,
      isAuthenticated: Boolean(data?.user),
      isAdmin: data?.user.role === "ADMIN",
      // A 401 means signed out, which is an answer rather than an error.
      error: error instanceof ApiError && error.status !== 401 ? error : null,
      refetch: () => void refetch(),
    }),
    [data, isLoading, error, refetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/** Drops every cached query on sign out. Without this the next user to sign in
 *  on the same browser briefly sees the previous tenant's data from cache,
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
      // Mirrors the sign-in path deliberately: remove the tenant-scoped
      // queries, then WRITE the identity rather than deleting it.
      //
      // clear() on its own removes the query this provider observes without
      // giving the observer a new value, so for one render the context still
      // reports the previous session. The caller navigates to /login in that
      // same tick, the login page sees isAuthenticated still true and sends
      // the user straight back to the dashboard, where every query then 401s.
      // The visible bug was "sign out does nothing except break the page".
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    }
  };
}
