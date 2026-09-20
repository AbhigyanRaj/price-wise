import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowRight, Boxes, ClipboardList, Gauge, Zap } from "lucide-react";
import { api, queryString } from "@/lib/api";
import { ConfidenceBadge, DeltaChip, Money } from "@/components/data/Metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/data/States";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AuditLogDto, ProductDto, RecommendationDto } from "@/lib/types";

/**
 * Overview.
 *
 * Deliberately not a wall of charts. The only question this screen answers is
 * "is anything waiting on me, and should I be worried", and it answers it in
 * the first two seconds. Anything that needs study belongs on Decisions.
 */
export function DashboardPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const { data: pending, isPending: loadingQueue, isError, error, refetch } = useQuery({
    queryKey: ["recommendations", { status: "PENDING", limit: 100 }],
    queryFn: ({ signal }) =>
      api.paged<RecommendationDto>(
        `/recommendations${queryString({ status: "PENDING", limit: 100 })}`,
        signal,
      ),
  });

  const { data: recent } = useQuery({
    queryKey: ["recommendations", { limit: 50 }],
    queryFn: ({ signal }) =>
      api.paged<RecommendationDto>(`/recommendations${queryString({ limit: 50 })}`, signal),
  });

  const { data: products } = useQuery({
    queryKey: ["products", { pageSize: 1 }],
    queryFn: ({ signal }) => api.paged<ProductDto>("/products?pageSize=1", signal),
  });

  const { data: activity } = useQuery({
    queryKey: ["audit", { limit: 8 }],
    queryFn: ({ signal }) => api.paged<AuditLogDto>("/audit-logs?limit=8", signal),
  });

  const pendingItems = pending?.items ?? [];
  const recentItems = recent?.items ?? [];
  const autoExecuted = recentItems.filter((r) => r.status === "AUTO_EXECUTED").length;
  const averageConfidence =
    recentItems.length > 0
      ? recentItems.reduce((sum, r) => sum + r.confidenceScore, 0) / recentItems.length
      : 0;

  const topPending = [...pendingItems]
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 5);

  // The landing screen had no error branch at all, so an API that was down
  // rendered four empty stat cards and two empty lists: indistinguishable from
  // a brand-new organization with nothing in it. The queue query is the
  // representative one; if it failed the others almost certainly did too.
  if (isError) {
    return (
      <div className="px-[34px] py-7">
        <ErrorState
          title="Could not load your overview"
          description={error instanceof Error ? error.message : "The API did not respond."}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="px-[34px] py-7">
      <header className="mb-6">
        <h1>{session?.organization.name}</h1>
        <p className="mt-1 text-[12.5px] leading-[1.6] text-t3">
          {pendingItems.length > 0
            ? `${pendingItems.length} recommendations are waiting on a decision.`
            : "Nothing is waiting on a decision right now."}
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Pending decisions"
          value={loadingQueue ? null : String(pendingItems.length)}
          Icon={ClipboardList}
        />
        <Stat label="Auto-executed" value={recent ? String(autoExecuted) : null} Icon={Zap} />
        <Stat
          label="Average confidence"
          value={recent ? averageConfidence.toFixed(2) : null}
          Icon={Gauge}
          // The threshold is what makes the average mean anything: 0.79 is a
          // different number entirely depending on where the line sits.
          footnote={
            session
              ? `threshold ${session.organization.confidenceThreshold.toFixed(2)}`
              : undefined
          }
        />
        <Stat
          label="Products"
          value={products ? String(products.pagination.totalCount) : null}
          Icon={Boxes}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h3>Highest confidence, waiting on you</h3>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11.5px]"
              onClick={() => navigate("/decisions")}
            >
              Open queue
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>

          {topPending.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12.5px] text-t3">
              The queue is clear. Pricewise keeps watching.
            </p>
          ) : (
            <ul className="divide-y divide-line2">
              {topPending.map((rec) => (
                <li key={rec.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/decisions/${rec.id}`)}
                    className="flex h-[33px] w-full items-center gap-3 px-4 text-left transition-colors duration-[110ms] hover:bg-hover"
                  >
                    <span className="shrink-0 font-mono text-[10.5px] text-t4">
                      {rec.product?.sku}
                    </span>
                    <span className="flex-1 truncate text-[12.5px] text-t1">
                      {rec.product?.name}
                    </span>
                    <Money value={rec.recommendedPrice} className="text-[12.5px]" />
                    <DeltaChip fraction={rec.deltaPct} className="w-16 justify-end text-[11.5px]" />
                    <ConfidenceBadge value={rec.confidenceScore} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-card border border-line bg-panel">
          <h3 className="border-b border-line px-4 py-2.5">Recent activity</h3>
          <ul className="divide-y divide-line2">
            {(activity?.items ?? []).map((entry) => (
              <li key={entry.id} className="flex h-[33px] items-center gap-2 px-4">
                <span className="flex-1 truncate font-mono text-[10.5px] text-t3">
                  {entry.action}
                </span>
                {/* A null actor means the system acted. That distinction is the
                    whole point of the audit trail, so it is marked rather than
                    left to inference. */}
                {entry.userId === null && (
                  <span className="shrink-0 rounded-tag bg-acc-a px-1.5 py-0.5 font-mono text-[9.5px] text-acc-t2">
                    system
                  </span>
                )}
                <span className="shrink-0 font-mono text-[10px] text-t5">
                  {relativeTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          {(activity?.items ?? []).length === 0 && (
            <p className="px-4 py-10 text-center text-[12.5px] text-t3">Nothing recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  Icon,
  footnote,
}: {
  label: string;
  value: string | null;
  Icon: typeof Boxes;
  footnote?: string | undefined;
}) {
  return (
    <div className="rounded-card border border-line bg-panel px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11.5px] text-t3">{label}</span>
        <Icon size={13} strokeWidth={1.2} className="text-t5" aria-hidden="true" />
      </div>
      {value === null ? (
        <Skeleton className="h-[22px] w-16" />
      ) : (
        <span className={cn("tnum block font-mono text-[22px] leading-none tracking-[-0.01em] text-t0")}>
          {value}
        </span>
      )}
      {footnote && <span className="mt-1.5 block font-mono text-[10px] text-t5">{footnote}</span>}
    </div>
  );
}
