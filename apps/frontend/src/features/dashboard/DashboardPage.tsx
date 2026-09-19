import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowRight, Boxes, ClipboardList, Gauge, Zap } from "lucide-react";
import { api, queryString } from "@/lib/api";
import { ConfidenceBadge, DeltaChip, Money } from "@/components/data/Metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { relativeTime } from "@/lib/format";
import type { AuditLogDto, ProductDto, RecommendationDto } from "@/lib/types";

export function DashboardPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const { data: pending, isPending: loadingQueue } = useQuery({
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

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1>{session?.organization.name}</h1>
        <p className="mt-0.5 text-sm text-ink-secondary">
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
        <Stat
          label="Auto-executed recently"
          value={recent ? String(autoExecuted) : null}
          Icon={Zap}
        />
        <Stat
          label="Average confidence"
          value={recent ? averageConfidence.toFixed(2) : null}
          Icon={Gauge}
        />
        <Stat
          label="Products"
          value={products ? String(products.pagination.totalCount) : null}
          Icon={Boxes}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-md border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h3 className="text-sm">Highest confidence, waiting on you</h3>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => navigate("/recommendations")}>
              Open queue
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>

          {topPending.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-secondary">
              The queue is clear.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {topPending.map((rec) => (
                <li key={rec.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/recommendations/${rec.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 hover:bg-surface-hover"
                  >
                    <span className="font-mono text-[11px] text-ink-tertiary">
                      {rec.product?.sku}
                    </span>
                    <span className="flex-1 truncate text-[13px]">{rec.product?.name}</span>
                    <Money value={rec.recommendedPrice} className="text-[13px]" />
                    <DeltaChip fraction={rec.deltaPct} className="w-16 justify-end text-xs" />
                    <ConfidenceBadge value={rec.confidenceScore} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border border-line bg-surface">
          <h3 className="border-b border-line px-4 py-2.5 text-sm">Recent activity</h3>
          <ul className="divide-y divide-line">
            {(activity?.items ?? []).map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 px-4 py-2">
                <span className="flex-1 truncate font-mono text-[11px] text-ink-secondary">
                  {entry.action}
                </span>
                {entry.userId === null && (
                  <span className="rounded-sm bg-brand-wash px-1.5 py-0.5 text-[10px] text-brand">
                    System
                  </span>
                )}
                <span className="shrink-0 text-[11px] text-ink-tertiary">
                  {relativeTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string | null;
  Icon: typeof Boxes;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] text-ink-secondary">{label}</span>
        <Icon className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden="true" />
      </div>
      {value === null ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <span className="tnum font-mono text-2xl tracking-[-0.02em]">{value}</span>
      )}
    </div>
  );
}
