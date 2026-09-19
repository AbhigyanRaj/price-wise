import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RecommendationDto } from "@/lib/types";

/**
 * How many decisions are waiting on this user.
 *
 * Three surfaces show it: the rail badge, the top-bar pill and the Decisions
 * header. One query key so they cannot disagree with each other, and so
 * resolving a decision updates all three from a single invalidation.
 *
 * It rides the existing ["recommendations"] key prefix, so the shared
 * invalidateAfterDecision already refreshes it with no extra wiring.
 */
export function usePendingCount(): number {
  const { data } = useQuery({
    queryKey: ["recommendations", "pending-count"],
    queryFn: ({ signal }) =>
      api.paged<RecommendationDto>("/recommendations?status=PENDING&limit=100", signal),
    // The count drives a badge, not a decision. A slightly stale number beats a
    // request on every navigation.
    staleTime: 30_000,
  });

  // Count what actually arrived.
  //
  // Paged<T> types pagination as OffsetPagination & CursorPagination, but the
  // queue endpoint is cursor-paginated and returns no totalCount at all, so
  // reading it would be trusting a field the type only claims exists. The
  // badge caps at 99+ anyway, so a page of 100 answers it exactly.
  return data?.items.length ?? 0;
}
