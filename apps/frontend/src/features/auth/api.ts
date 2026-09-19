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
      // Cleared before seeding, not after. Without this the next user to sign
      // in briefly sees the previous tenant's cached data, which in a
      // multi-tenant product is the worst bug available. useSignOut already
      // clears for exactly this reason; the sign-in path had the same hole
      // whenever a session expired without an explicit sign-out.
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, session);
    },
  });
}

export const useLogin = () => useAuthEntry<LoginInput>("/auth/login");

/** Creates an organization and its first admin. */
export const useSignup = () => useAuthEntry<SignupInput>("/auth/signup");

/** Joins an existing organization with a 12-character invite code. */
export const useInviteSignup = () => useAuthEntry<InviteSignupInput>("/auth/signup/invite");
