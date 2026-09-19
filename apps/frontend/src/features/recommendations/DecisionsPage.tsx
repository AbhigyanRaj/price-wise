import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ErrorState, FullPageSpinner } from "@/components/data/States";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/useAuth";
import { ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import {
  useApprove,
  useBatchApprove,
  useModify,
  useRecommendation,
  useRecommendations,
  useReject,
  useUndo,
} from "./api";
import { DecisionQueue, type QueueFilter } from "./DecisionQueue";
import { DecisionDetail } from "./DecisionDetail";
import { RejectDialog } from "./RejectDialog";

/**
 * Two panes, one screen.
 *
 * The queue and the decision belong together: resolving one should reveal the
 * next without a navigation, because the analyst's job is a sequence, not a
 * series of separate visits. The selected id lives in the URL anyway, so a
 * decision is still linkable and refreshable.
 */
export function DecisionsPage() {
  const { recommendationId } = useParams<{ recommendationId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const toast = useToast();

  const [filter, setFilter] = useState<QueueFilter>("PENDING");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const queue = useRecommendations({ status: filter, minConfidence: "" });
  const approve = useApprove();
  const reject = useReject();
  const modify = useModify();
  const undo = useUndo();
  const batch = useBatchApprove();

  const items = useMemo(() => {
    const flat = queue.data?.pages.flatMap((page) => page.items) ?? [];
    // Confidence descending: clear the obvious ones fast, spend attention on
    // the ambiguous.
    return [...flat].sort((a, b) => b.confidenceScore - a.confidenceScore);
  }, [queue.data]);

  const selectedId = recommendationId ?? items[0]?.id ?? null;
  const detail = useRecommendation(selectedId ?? undefined);
  const threshold = session?.organization.confidenceThreshold ?? 0.8;

  // Keep the URL pointing at something real. Resolving the last item in a
  // filter would otherwise leave a detail pane showing a row that is gone.
  useEffect(() => {
    if (!recommendationId && items[0]) {
      navigate(`/decisions/${items[0].id}`, { replace: true });
    }
  }, [recommendationId, items, navigate]);

  function select(id: string) {
    setActionError(null);
    navigate(`/decisions/${id}`);
  }

  /** After resolving, land on the next item rather than an empty pane. */
  function advance(resolvedId: string) {
    const index = items.findIndex((r) => r.id === resolvedId);
    const next = items[index + 1] ?? items[index - 1];
    navigate(next ? `/decisions/${next.id}` : "/decisions", { replace: true });
  }

  function report(err: unknown, fallback: string) {
    setActionError(err instanceof ApiError ? err.message : fallback);
  }

  function undoable(id: string, message: string, value?: string) {
    toast({
      message,
      ...(value ? { value } : {}),
      tone: "pos",
      onUndo: async () => {
        try {
          await undo.mutateAsync(id);
          navigate(`/decisions/${id}`);
        } catch (err) {
          report(err, "Could not undo that.");
        }
      },
    });
  }

  function handleApprove() {
    if (!selectedId || !detail.data) return;
    const id = selectedId;
    const price = money(detail.data.recommendedPrice);
    setActionError(null);
    approve.mutate(id, {
      onSuccess: () => {
        undoable(id, "Approved", price);
        advance(id);
      },
      onError: (err) => report(err, "Could not approve that."),
    });
  }

  function handleModify(price: number) {
    if (!selectedId) return;
    const id = selectedId;
    setActionError(null);
    modify.mutate(
      { id, modifiedPrice: price },
      {
        onSuccess: () => {
          undoable(id, "Approved at your price", money(price));
          advance(id);
        },
        onError: (err) => report(err, "Could not apply that price."),
      },
    );
  }

  function handleReject(reason: string) {
    if (!selectedId) return;
    const id = selectedId;
    reject.mutate(
      { id, reason },
      {
        onSuccess: () => {
          setRejecting(false);
          undoable(id, "Rejected");
          advance(id);
        },
        onError: (err) => report(err, "Could not reject that."),
      },
    );
  }

  function handleBatch() {
    const ids = [...checked];
    batch.mutate(ids, {
      onSuccess: (results) => {
        const ok = results.filter((r) => r.ok).length;
        const failed = results.length - ok;
        setChecked(new Set());
        // Partial success stated plainly. "Approved 8" when two failed would
        // be a lie the analyst only discovers later.
        toast({
          message: failed === 0 ? `Approved ${ok}` : `Approved ${ok}, ${failed} could not be`,
          tone: failed === 0 ? "pos" : "amber",
        });
      },
      onError: (err) => report(err, "Could not approve those."),
    });
  }

  // Keyboard triage. Ignored while typing, so J in a reject reason is a J.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const index = items.findIndex((r) => r.id === selectedId);
      const key = event.key.toLowerCase();

      if (key === "j" && items[index + 1]) {
        event.preventDefault();
        select(items[index + 1]!.id);
      } else if (key === "k" && items[index - 1]) {
        event.preventDefault();
        select(items[index - 1]!.id);
      } else if (key === "a" && detail.data?.status === "PENDING") {
        event.preventDefault();
        handleApprove();
      } else if (key === "r" && detail.data?.status === "PENDING") {
        event.preventDefault();
        setRejecting(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const busy = approve.isPending || reject.isPending || modify.isPending;

  return (
    <div className="flex h-[calc(100dvh-46px)]">
      <DecisionQueue
        items={items}
        isPending={queue.isPending}
        filter={filter}
        onFilterChange={(next) => {
          setFilter(next);
          setChecked(new Set());
          navigate("/decisions", { replace: true });
        }}
        selectedId={selectedId}
        onSelect={select}
        checked={checked}
        onToggleCheck={(id) =>
          setChecked((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onClearChecks={() => setChecked(new Set())}
        onApproveChecked={handleBatch}
        batchPending={batch.isPending}
      />

      <div className="min-w-0 flex-1">
        {actionError && (
          <div role="alert" className="border-b border-neg-border bg-neg-a px-[34px] py-2">
            <p className="text-[12.5px] text-neg">{actionError}</p>
          </div>
        )}

        {!selectedId && !queue.isPending && (
          <div className="grid h-full place-items-center px-8 text-center">
            <p className="max-w-sm text-[13px] text-t3">
              Nothing selected. Pick a decision from the queue, or switch filters to see resolved
              ones.
            </p>
          </div>
        )}

        {selectedId && detail.isPending && <FullPageSpinner />}

        {selectedId && detail.isError && (
          <ErrorState
            description={
              detail.error instanceof Error ? detail.error.message : "Could not load this decision."
            }
            onRetry={() => void detail.refetch()}
          />
        )}

        {detail.data && (
          <DecisionDetail
            rec={detail.data}
            threshold={threshold}
            onApprove={handleApprove}
            onReject={() => setRejecting(true)}
            onModify={handleModify}
            busy={busy}
          />
        )}
      </div>

      {rejecting && detail.data && (
        <RejectDialog
          recommendation={detail.data}
          onClose={() => setRejecting(false)}
          isSubmitting={reject.isPending}
          onSubmit={handleReject}
        />
      )}
    </div>
  );
}
