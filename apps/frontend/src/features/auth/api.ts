import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InviteSignupInput, LoginInput, SignupInput } from "@pricewise/shared";
import { api } from "@/lib/api";
import { SESSION_QUERY_KEY } from "./useAuth";
import type { SessionDto } from "@/lib/types";

/**
 * The three ways into the app.
 *
 * Each hook owns the cache work and nothing else: no error handling, no
 * navigation. Call sites pass { onSuccess, onError } to .mutate(), which is
 * the convention every other feature module in this app follows.
 */

function useAuthEntry<TInput>(path: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: TInput) => api.post<SessionDto>(path, values),
    onSuccess(session) {
      // Drop every cached query from the previous session so a new tenant never
      // sees the old tenant's rows, which in a multi-tenant product is the
      // worst bug available.
      //
      // removeQueries with a predicate, NOT clear(). clear() wipes the whole
      // cache including the identity query that AuthProvider is actively
      // observing, so the observer goes back to pending and RequireAuth shows a
      // full-page spinner in the same tick that we are trying to write the
      // session into it. Excluding the auth key means the write below lands on
      // a query that was never torn down.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      queryClient.setQueryData(SESSION_QUERY_KEY, session);
    },
  });
}

export const useLogin = () => useAuthEntry<LoginInput>("/auth/login");

/** Creates an organization and its first admin. */
export const useSignup = () => useAuthEntry<SignupInput>("/auth/signup");

/** Joins an existing organization with a 12-character invite code. */
export const useInviteSignup = () => useAuthEntry<InviteSignupInput>("/auth/signup/invite");
