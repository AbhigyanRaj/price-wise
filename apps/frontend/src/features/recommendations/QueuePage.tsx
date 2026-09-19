import { useState } from "react";
import { useNavigate } from "react-router";
import { Check, X } from "lucide-react";
import type { RecStatus } from "@pricewise/shared";
import { ConfidenceBadge, DeltaChip, Money, StatusBadge } from "@/components/data/Metrics";
import { EmptyFirstRun, EmptyNoMatches, ErrorState } from "@/components/data/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime, absoluteTime } from "@/lib/format";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  DEFAULT_QUEUE_FILTERS,
  useApprove,
  useRecommendations,
  useReject,
  type QueueFilters,
} from "./api";
import { RejectDialog } from "./RejectDialog";
import type { RecommendationDto } from "@/lib/types";

const STATUSES: { value: string; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "", label: "All" },
  { value: "APPROVED", label: "Approved" },
  { value: "AUTO_EXECUTED", label: "Auto-executed" },
  { value: "MODIFIED", label: "Modified" },
  { value: "REJECTED", label: "Rejected" },
];

export function QueuePage() {
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_QUEUE_FILTERS);
  const [rejecting, setRejecting] = useState<RecommendationDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isPending, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecommendations(filters);
  const approve = useApprove();
  const reject = useReject();
  const navigate = useNavigate();

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  // Confidence descending by default: the obvious ones first, so attention
  // goes where judgement is actually needed.
  const sorted = [...items].sort((a, b) => b.confidenceScore - a.confidenceScore);

  function handleApprove(id: string) {
    setActionError(null);
    approve.mutate(id, {
      onError(err) {
        setActionError(
          err instanceof ApiError ? err.message : "Could not approve. Please try again.",
        );
      },
    });
  }

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1>Approval queue</h1>
        <p className="mt-0.5 text-sm text-ink-secondary">
          Sorted by confidence. Clear the obvious ones fast and spend time on the ambiguous.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-1">
        {STATUSES.map((status) => (
          <button
            key={status.value || "all"}
            type="button"
            onClick={() => setFilters((c) => ({ ...c, status: status.value }))}
            className={cn(
              "rounded-md px-2.5 py-1 text-[13px] transition-colors duration-100",
              filters.status === status.value
                ? "bg-brand-wash font-medium text-brand"
                : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
            )}
          >
            {status.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div role="alert" className="mb-3 rounded-md border border-down/40 bg-down-wash px-3 py-2">
          <p className="text-[13px] text-down">{actionError}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        {isPending && <QueueSkeleton />}

        {isError && (
          <ErrorState
            description={error instanceof Error ? error.message : "Could not load the queue."}
            onRetry={() => void refetch()}
          />
        )}

        {!isPending && !isError && sorted.length === 0 && filters.status === "PENDING" && (
          <EmptyFirstRun
            title="Nothing waiting on you"
            description="Every recommendation has been resolved. Generate one from the catalog to see more."
            action={{ label: "Open catalog", onClick: () => navigate("/products") }}
          />
        )}

        {!isPending && !isError && sorted.length === 0 && filters.status !== "PENDING" && (
          <EmptyNoMatches
            title="No recommendations with this status"
            description="Try a different status filter to see the rest of the history."
            action={{
              label: "Show pending",
              onClick: () => setFilters(DEFAULT_QUEUE_FILTERS),
            }}
          />
        )}

        <ul>
          {sorted.map((rec) => (
            <QueueRow
              key={rec.id}
              rec={rec}
              onOpen={() => navigate(`/recommendations/${rec.id}`)}
              onApprove={() => handleApprove(rec.id)}
              onReject={() => setRejecting(rec)}
              busy={approve.isPending}
            />
          ))}
        </ul>
      </div>

      {hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading" : "Load more"}
          </Button>
        </div>
      )}

      {rejecting && (
        <RejectDialog
          recommendation={rejecting}
          onClose={() => setRejecting(null)}
          onSubmit={(reason) =>
            reject.mutate(
              { id: rejecting.id, reason },
              {
                onSuccess: () => setRejecting(null),
                onError: (err) =>
                  setActionError(
                    err instanceof ApiError ? err.message : "Could not reject. Please try again.",
                  ),
              },
            )
          }
          isSubmitting={reject.isPending}
        />
      )}
    </div>
  );
}

function QueueRow({
  rec,
  onOpen,
  onApprove,
  onReject,
  busy,
}: {
  rec: RecommendationDto;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const isPending = rec.status === "PENDING";

  return (
    <li className="border-b border-line last:border-0">
      <div
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onOpen();
          }
        }}
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors duration-100 hover:bg-surface-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-tertiary">{rec.product?.sku}</span>
            <span className="truncate text-[13px]">{rec.product?.name}</span>
            {!isPending && <StatusBadge status={rec.status as RecStatus} />}
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-secondary">{rec.rationale}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Money value={rec.currentPriceAtTime} className="text-xs text-ink-tertiary" />
          <span className="text-ink-tertiary" aria-hidden="true">
            to
          </span>
          <Money value={rec.recommendedPrice} className="text-[13px]" />
          <DeltaChip fraction={rec.deltaPct} className="w-16 justify-end text-xs" />
          <ConfidenceBadge value={rec.confidenceScore} />
          <span
            className="w-20 text-right text-xs text-ink-tertiary"
            title={absoluteTime(rec.createdAt)}
          >
            {relativeTime(rec.createdAt)}
          </span>

          {isPending && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove();
                }}
                aria-label={`Approve ${rec.product?.sku}`}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject();
                }}
                aria-label={`Reject ${rec.product?.sku}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function QueueSkeleton() {
  return (
    <ul>
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-2.5 w-96" />
          </div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-14" />
        </li>
      ))}
    </ul>
  );
}
