import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, queryString, type Paged } from "@/lib/api";
import type { RecommendationDetailDto, RecommendationDto } from "@/lib/types";

export interface QueueFilters {
  status: string;
  minConfidence: string;
}


const LIMIT = 25;

export function useRecommendations(filters: QueueFilters) {
  return useInfiniteQuery({
    queryKey: ["recommendations", filters],
    // v5 requires this explicitly; it is no longer inferred.
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.paged<RecommendationDto>(
        `/recommendations${queryString({ ...filters, limit: LIMIT, cursor: pageParam })}`,
        signal,
      ),
    // undefined stops the query. Returning null would loop forever.
    getNextPageParam: (lastPage: Paged<RecommendationDto>) =>
      lastPage.pagination.nextCursor ?? undefined,
  });
}

export function useRecommendation(id: string | undefined) {
  return useQuery({
    queryKey: ["recommendations", "detail", id],
    queryFn: ({ signal }) => api.get<RecommendationDetailDto>(`/recommendations/${id}`, signal),
    enabled: Boolean(id),
  });
}

/** Everything a decision touches: the queue, the catalog (the price may have
 *  moved) and the audit trail. */
function invalidateAfterDecision(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
    queryClient.invalidateQueries({ queryKey: ["products"] }),
    queryClient.invalidateQueries({ queryKey: ["audit"] }),
  ]);
}

/**
 * Removes one recommendation from a cached infinite queue, leaving every other
 * cache shape under the same key prefix untouched.
 */
function dropFromQueue(old: unknown, id: string): unknown {
  if (!old || typeof old !== "object") return old;
  const pages = (old as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return old;

  return {
    ...old,
    pages: (pages as Paged<RecommendationDto>[]).map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== id),
    })),
  };
}

export function useApprove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post<RecommendationDto>(`/recommendations/${id}/approve`),
    async onMutate(id) {
      // Optimistic: the analyst is working a queue, and a round trip per row
      // makes the screen feel slow. The row leaves immediately.
      await queryClient.cancelQueries({ queryKey: ["recommendations"] });
      const previous = queryClient.getQueriesData({ queryKey: ["recommendations"] });

      // The ["recommendations"] prefix is shared by three different shapes: the
      // infinite queue ({ pages }), the pending-count badge (a single Paged)
      // and a single detail object. setQueriesData hands this callback all
      // three, so it has to recognise the one it can transform instead of
      // assuming. Reaching for old.pages unconditionally threw a TypeError
      // inside onMutate, which aborts the mutation BEFORE mutationFn runs: the
      // approve request was never sent and the analyst saw only "Could not
      // approve that".
      queryClient.setQueriesData({ queryKey: ["recommendations"] }, (old: unknown) =>
        dropFromQueue(old, id),
      );

      return { previous };
    },
    onError(_error, _id, context) {
      // Put it back. The server refused, so the row is still the user's problem.
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => invalidateAfterDecision(queryClient),
  });
}

export function useReject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<RecommendationDto>(`/recommendations/${id}/reject`, { reason }),
    onSettled: () => invalidateAfterDecision(queryClient),
  });
}

export function useModify() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, modifiedPrice }: { id: string; modifiedPrice: number }) =>
      api.post<RecommendationDto>(`/recommendations/${id}/modify`, { modifiedPrice }),
    onSettled: () => invalidateAfterDecision(queryClient),
  });
}

/** Returns a resolved decision to the queue. Bounded server-side to ten
 *  minutes, so a stale toast fails with a conflict rather than silently
 *  rewriting old history. */
export function useUndo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<RecommendationDto>(`/recommendations/${id}/undo`, {}),
    onSettled: () => invalidateAfterDecision(queryClient),
  });
}

export interface BatchApproveResult {
  id: string;
  ok: boolean;
  error?: string;
}

/** Approves several. Returns a result per id, so partial success is visible
 *  rather than collapsing into one error. */
export function useBatchApprove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post<BatchApproveResult[]>("/recommendations/batch-approve", { ids }),
    onSettled: () => invalidateAfterDecision(queryClient),
  });
}
