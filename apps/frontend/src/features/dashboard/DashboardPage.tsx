import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { api, queryString } from "@/lib/api";
import { DeltaChip, Money } from "@/components/data/Metrics";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/data/States";
import { useAuth } from "@/features/auth/useAuth";
import { auditActor, auditLabel } from "@/lib/auditLabels";
import { absoluteTime, money, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AuditLogDto, ProductDto, RecommendationDto } from "@/lib/types";

/**
 * Overview.
 *
 * Answers one question in the first two seconds: is anything waiting on me,
 * and should I be worried. Anything that needs study belongs on Decisions.
 *
 * The previous version opened with the organization's name as an H1 and four
 * icon stat cards, which is the most templated composition in software and
 * told the analyst nothing they could act on. The headline now states the
 * situation, the numbers moved into a rail where each one carries the
 * consequence that makes it mean something, and the queue is ordered by what
 * it costs to get wrong rather than by confidence.
 *
 * Everything here is computed from rows the API returned. Nothing on this
 * screen is on a timer.
 */
export function DashboardPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const threshold = session?.organization.confidenceThreshold ?? 0.8;

  const {
    data: pending,
    isPending: loadingQueue,
    isError,
    error,
    refetch,
  } = useQuery({
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
    queryKey: ["products", { pageSize: 100 }],
    queryFn: ({ signal }) => api.paged<ProductDto>("/products?pageSize=100", signal),
  });

  const { data: activity } = useQuery({
    queryKey: ["audit", { limit: 6 }],
    queryFn: ({ signal }) => api.paged<AuditLogDto>("/audit-logs?limit=6", signal),
  });

  // The landing screen had no error branch, so an API that was down rendered
  // empty panels: indistinguishable from a brand-new organization. The queue
  // query is the representative one; if it failed the others almost certainly
  // did too.
  if (isError) {
    return (
      <div className="px-4 py-5 md:px-[34px] md:py-7">
        <ErrorState
          title="Could not load your overview"
          description={error instanceof Error ? error.message : "The API did not respond."}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const queue = pending?.items ?? [];
  const recentItems = recent?.items ?? [];
  const catalogue = products?.items ?? [];

  /** What each decision moves, in money. This is the ordering key: a 14%
   *  change on a cheap SKU matters less than a 3% change on an expensive one,
   *  and sorting by confidence buries that. */
  const stake = (r: RecommendationDto) =>
    Math.abs(r.recommendedPrice - r.currentPriceAtTime);

  const ranked = [...queue].sort((a, b) => stake(b) - stake(a));
  const totalStake = queue.reduce((sum, r) => sum + stake(r), 0);
  const aboveThreshold = queue.filter((r) => r.confidenceScore >= threshold).length;
  const autoExecuted = recentItems.filter((r) => r.status === "AUTO_EXECUTED").length;
  const meanConfidence =
    recentItems.length > 0
      ? recentItems.reduce((sum, r) => sum + r.confidenceScore, 0) / recentItems.length
      : null;
  const belowFloor = catalogue.filter((p) => p.belowFloor).length;

  return (
    <div className="px-4 py-5 md:px-[34px] md:py-7">
      <header className="pw-rise mb-7">
        <p className="eyebrow mb-2">{session?.organization.name}</p>
        {loadingQueue ? (
          <Skeleton className="h-7 w-[26ch]" />
        ) : (
          <h1>
            {queue.length === 0
              ? "Nothing is waiting on you."
              : `${queue.length} ${queue.length === 1 ? "decision needs" : "decisions need"} your attention.`}
          </h1>
        )}
        <p className="mt-1.5 max-w-[68ch] text-[12.5px] leading-[1.6] text-t3">
          {queue.length === 0
            ? "Pricewise keeps watching the catalogue. You will be brought back in when something needs judgment."
            : aboveThreshold > 0
              ? `${aboveThreshold} of them already clear your ${threshold.toFixed(2)} threshold and are here only because a business rule stopped them.`
              : `All of them fall below your ${threshold.toFixed(2)} threshold, which is why they came to you rather than executing.`}
        </p>
      </header>

      {/* Main and rail. The rail is what removes the empty lower half: the
          numbers that used to sit in four cards across the top now run down
          the side, where each has room for the sentence that makes it mean
          something. */}
      <div className="grid gap-x-8 gap-y-7 xl:grid-cols-[minmax(0,1fr)_282px]">
        <div className="pw-rise min-w-0 space-y-6" style={{ "--pw-delay": "60ms" } as React.CSSProperties}>
          <section>
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <h3>Awaiting your decision</h3>
              <Link
                to="/decisions"
                className="text-[11.5px] text-acc-t2 underline-offset-2 hover:underline"
              >
                Open the queue
              </Link>
            </div>
            <p className="mb-3 text-[11.5px] text-t4">
              Ordered by what the change is worth, not by how old it is.
            </p>

            <div className="overflow-hidden rounded-card border border-line bg-panel">
              {loadingQueue && (
                <ul className="divide-y divide-line2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="ml-auto h-3 w-16" />
                      <Skeleton className="h-3 w-12" />
                    </li>
                  ))}
                </ul>
              )}

              {!loadingQueue && ranked.length === 0 && (
                <p className="px-4 py-12 text-center text-[12.5px] text-t3">
                  The queue is clear.
                </p>
              )}

              <ul className="divide-y divide-line2">
                {ranked.slice(0, 6).map((rec) => (
                  <QueueRow
                    key={rec.id}
                    rec={rec}
                    threshold={threshold}
                    stake={stake(rec)}
                    onOpen={() => navigate(`/decisions/${rec.id}`)}
                  />
                ))}
              </ul>

              {ranked.length > 6 && (
                <Link
                  to="/decisions"
                  className="block border-t border-line px-4 py-2 text-center text-[11.5px] text-t4 transition-colors duration-[110ms] hover:bg-hover hover:text-t1"
                >
                  {ranked.length - 6} more in the queue
                </Link>
              )}
            </div>
          </section>

          <section>
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <h3>Recent activity</h3>
              <Link
                to="/activity"
                className="text-[11.5px] text-acc-t2 underline-offset-2 hover:underline"
              >
                Full trail
              </Link>
            </div>

            <div className="overflow-hidden rounded-card border border-line bg-panel">
              <ul className="divide-y divide-line2">
                {(activity?.items ?? []).map((entry) => {
                  const label = auditLabel(entry.action);
                  const actor = auditActor(entry.userId, session?.user.id, entry.userName);
                  return (
                    <li key={entry.id} className="flex items-center gap-2.5 px-4 py-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid h-[19px] w-[19px] shrink-0 place-items-center rounded-tag font-mono text-[8.5px] font-medium",
                          actor.isSystem
                            ? "bg-acc-a text-acc-t2"
                            : "bg-avatar-bg text-t2",
                        )}
                      >
                        {actor.initials}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-t2">
                        <span className="text-t0">{actor.name}</span> {label.sentence}
                      </span>
                      <span
                        className="shrink-0 font-mono text-[10px] text-t5"
                        title={absoluteTime(entry.createdAt)}
                      >
                        {relativeTime(entry.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {(activity?.items ?? []).length === 0 && (
                <p className="px-4 py-12 text-center text-[12.5px] text-t3">
                  Nothing recorded yet. Approving, rejecting or changing a setting will appear
                  here.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* The rail. Every figure carries the line that makes it actionable;
            a bare "0.77" is not information. */}
        <aside
          className="pw-rise space-y-5 xl:border-l xl:border-line xl:pl-7"
          style={{ "--pw-delay": "120ms" } as React.CSSProperties}
        >
          <p className="eyebrow">Position</p>

          <Metric
            label="Margin at stake in the queue"
            value={queue.length > 0 ? money(totalStake) : null}
            empty="Nothing pending"
            sub={
              queue.length > 0
                ? `across ${queue.length} ${queue.length === 1 ? "decision" : "decisions"} waiting on you`
                : undefined
            }
            loading={loadingQueue}
          />

          <Metric
            label="Executed automatically"
            value={recent ? String(autoExecuted) : null}
            sub={
              recent
                ? `of the last ${recentItems.length} recommendations, without review`
                : undefined
            }
            loading={!recent}
          />

          <Metric
            label="Mean confidence"
            value={meanConfidence !== null ? meanConfidence.toFixed(2) : null}
            empty="No recommendations yet"
            tone={
              meanConfidence === null ? "neutral" : meanConfidence >= threshold ? "pos" : "amber"
            }
            sub={
              meanConfidence !== null
                ? meanConfidence >= threshold
                  ? `at or above your ${threshold.toFixed(2)} threshold`
                  : `below your ${threshold.toFixed(2)} threshold, so most decisions reach you`
                : undefined
            }
            loading={!recent}
          />

          <Metric
            label="Products below their floor"
            value={products ? String(belowFloor) : null}
            tone={belowFloor > 0 ? "neg" : "neutral"}
            sub={
              products
                ? belowFloor > 0
                  ? "priced under the margin they are meant to hold"
                  : `all ${products.pagination.totalCount} products are above their floor`
                : undefined
            }
            loading={!products}
          />

          <p className="border-t border-line pt-4 font-mono text-[10.5px] leading-[1.7] text-t5">
            Auto-execution at ≥ {threshold.toFixed(2)}
            <br />
            Max single change ±
            {Math.round((session?.organization.maxPriceDeltaPct ?? 0.2) * 100)}%
          </p>
        </aside>
      </div>
    </div>
  );
}

function QueueRow({
  rec,
  threshold,
  stake,
  onOpen,
}: {
  rec: RecommendationDto;
  threshold: number;
  stake: number;
  onOpen: () => void;
}) {
  const clears = rec.confidenceScore >= threshold;

  return (
    <li className="relative">
      {/* The spine says WHY this row is here, which is the one thing a colour
          can carry without a label doing the work twice. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          clears ? "bg-amber" : "bg-line3",
        )}
      />
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-2.5 pl-5 text-left transition-colors duration-[110ms] hover:bg-hover"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[12.5px] font-medium text-t0">{rec.product?.name}</span>
            <span className="shrink-0 font-mono text-[10.5px] text-t4">{rec.product?.sku}</span>
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-t4">
            {clears
              ? "Cleared your threshold, held back by a rule"
              : "Below your threshold, so it needs a look"}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="flex items-baseline justify-end gap-2">
            <Money value={rec.recommendedPrice} className="text-[12.5px] text-t0" />
            <DeltaChip fraction={rec.deltaPct} className="text-[11.5px]" />
          </span>
          <span className="tnum mt-0.5 block font-mono text-[10.5px] text-t5">
            {money(stake)} at stake
          </span>
        </span>

        <span className="hidden w-[74px] shrink-0 items-center gap-1.5 sm:flex">
          <span aria-hidden="true" className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            <span
              className={cn(
                "block h-full rounded-full",
                clears ? "bg-pos" : rec.confidenceScore >= 0.7 ? "bg-amber" : "bg-neg",
              )}
              style={{ width: `${Math.round(rec.confidenceScore * 100)}%` }}
            />
          </span>
          <span className="tnum shrink-0 font-mono text-[10.5px] text-t3">
            {rec.confidenceScore.toFixed(2)}
          </span>
        </span>
      </button>
    </li>
  );
}

function Metric({
  label,
  value,
  sub,
  empty,
  tone = "neutral",
  loading,
}: {
  label: string;
  value: string | null;
  sub?: string | undefined;
  empty?: string | undefined;
  tone?: "pos" | "neg" | "amber" | "neutral";
  loading: boolean;
}) {
  return (
    <div>
      <p className="text-[11.5px] text-t3">{label}</p>
      {loading ? (
        <Skeleton className="mt-1.5 h-[22px] w-20" />
      ) : value === null ? (
        <p className="mt-1.5 text-[12.5px] text-t5">{empty ?? "No data"}</p>
      ) : (
        <p
          className={cn(
            "tnum mt-1.5 font-mono text-[22px] leading-none tracking-[-0.01em]",
            tone === "pos" && "text-pos",
            tone === "neg" && "text-neg",
            tone === "amber" && "text-amber",
            tone === "neutral" && "text-t0",
          )}
        >
          {value}
        </p>
      )}
      {sub && !loading && (
        <p className="mt-1.5 text-[11px] leading-[1.5] text-t4">{sub}</p>
      )}
    </div>
  );
}
