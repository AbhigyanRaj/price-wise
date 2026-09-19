import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AGENT_DISPLAY_NAMES } from "@pricewise/shared";
import { ArrowLeft, Check, ChevronDown, Pencil, X } from "lucide-react";
import { ConfidenceBadge, DeltaChip, Money, StatusBadge } from "@/components/data/Metrics";
import { ConfidenceWaterfall, FactorWeights } from "@/components/charts/ConfidenceWaterfall";
import { ErrorState, FullPageSpinner } from "@/components/data/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/useAuth";
import { ApiError } from "@/lib/api";
import { absoluteTime, duration, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useApprove, useModify, useRecommendation, useReject } from "./api";
import { RejectDialog } from "./RejectDialog";
import type { AgentRunDto } from "@/lib/types";

export function RecommendationDetailPage() {
  const { recommendationId } = useParams<{ recommendationId: string }>();
  const { data: rec, isPending, isError, error, refetch } = useRecommendation(recommendationId);
  const { session } = useAuth();
  const navigate = useNavigate();

  const approve = useApprove();
  const reject = useReject();
  const modify = useModify();

  const [showReject, setShowReject] = useState(false);
  const [modifyPrice, setModifyPrice] = useState("");
  const [showModify, setShowModify] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isPending) return <FullPageSpinner />;
  if (isError || !rec) {
    return (
      <ErrorState
        description={error instanceof Error ? error.message : "Recommendation not found."}
        onRetry={() => void refetch()}
      />
    );
  }

  const isPendingDecision = rec.status === "PENDING";
  const threshold = session?.organization.confidenceThreshold ?? 0.85;
  const breakdown = rec.factorWeights?.confidenceBreakdown ?? null;

  function reportError(err: unknown) {
    setActionError(err instanceof ApiError ? err.message : "That did not work. Please try again.");
  }

  return (
    <div className="p-6">
      <Link
        to="/recommendations"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-secondary transition-colors duration-100 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Queue
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-xs text-ink-tertiary">{rec.product?.sku}</span>
            <StatusBadge status={rec.status} />
          </div>
          <h1>{rec.product?.name}</h1>
          <div className="mt-2 flex items-center gap-2.5">
            <Money value={rec.currentPriceAtTime} className="text-ink-tertiary line-through" />
            <Money value={rec.recommendedPrice} className="text-lg" />
            <DeltaChip fraction={rec.deltaPct} />
            <ConfidenceBadge value={rec.confidenceScore} />
          </div>
        </div>

        {isPendingDecision && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                approve.mutate(rec.id, {
                  onSuccess: () => void refetch(),
                  onError: reportError,
                })
              }
              disabled={approve.isPending}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowModify((v) => !v)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Modify
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowReject(true)}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Reject
            </Button>
          </div>
        )}
      </header>

      {actionError && (
        <div role="alert" className="mb-4 rounded-md border border-down/40 bg-down-wash px-3 py-2">
          <p className="text-[13px] text-down">{actionError}</p>
        </div>
      )}

      {showModify && isPendingDecision && (
        <div className="mb-4 rounded-md border border-line bg-surface p-3">
          <label htmlFor="modify-price" className="mb-1.5 block text-[13px] font-medium">
            Your price instead
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="modify-price"
              type="number"
              step="0.01"
              value={modifyPrice}
              onChange={(e) => setModifyPrice(e.target.value)}
              placeholder={rec.recommendedPrice.toFixed(2)}
              className="h-8 w-40"
            />
            <Button
              size="sm"
              disabled={!modifyPrice || modify.isPending}
              onClick={() =>
                modify.mutate(
                  { id: rec.id, modifiedPrice: Number(modifyPrice) },
                  { onSuccess: () => void refetch(), onError: reportError },
                )
              }
            >
              Apply my price
            </Button>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-tertiary">
            Checked against the same margin floor as the AI. A human may not sell below cost
            either.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          {/* Rationale first. It is what a human actually reads. */}
          <section className="rounded-md border border-line bg-surface p-4">
            <h3 className="mb-2">Why this price</h3>
            <p className="text-[13px] leading-relaxed text-ink">{rec.rationale}</p>
          </section>

          <section className="rounded-md border border-line bg-surface">
            <h3 className="border-b border-line px-4 py-2.5 text-sm">Agent trail</h3>
            <ul className="divide-y divide-line">
              {rec.agentRuns.map((run) => (
                <AgentRunRow key={run.id} run={run} />
              ))}
            </ul>
          </section>

          {rec.comparable.length > 0 && (
            <section className="rounded-md border border-line bg-surface">
              <h3 className="border-b border-line px-4 py-2.5 text-sm">
                Past decisions on this product
              </h3>
              <ul className="divide-y divide-line">
                {rec.comparable.map((past) => (
                  <li key={past.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={past.status} />
                        <Money value={past.modifiedPrice ?? past.recommendedPrice} className="text-[13px]" />
                      </div>
                      <span className="text-xs text-ink-tertiary" title={absoluteTime(past.createdAt)}>
                        {relativeTime(past.createdAt)}
                      </span>
                    </div>
                    {past.rejectionReason && (
                      <p className="mt-1 text-[12px] text-ink-secondary">{past.rejectionReason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {rec.executions.length > 0 && (
            <section className="rounded-md border border-line bg-surface">
              <h3 className="border-b border-line px-4 py-2.5 text-sm">Execution history</h3>
              <ul className="divide-y divide-line">
                {rec.executions.map((execution) => (
                  <li key={execution.id} className="flex items-center justify-between px-4 py-2.5">
                    <span className="flex items-center gap-2 text-[13px]">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          execution.succeeded ? "bg-up" : "bg-down",
                        )}
                        aria-hidden="true"
                      />
                      <Money value={execution.attemptedPrice} />
                      <span className="text-ink-secondary">
                        {execution.succeeded
                          ? "pushed to the platform"
                          : execution.rolledBack
                            ? "failed, rolled back"
                            : "failed"}
                      </span>
                    </span>
                    <span className="text-xs text-ink-tertiary">
                      {relativeTime(execution.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-5">
          {breakdown && (
            <section className="rounded-md border border-line bg-surface p-4">
              <h3 className="mb-3">How confidence was assembled</h3>
              <ConfidenceWaterfall breakdown={breakdown} threshold={threshold} />
            </section>
          )}

          {rec.factorWeights && (
            <section className="rounded-md border border-line bg-surface p-4">
              <h3 className="mb-3">What drove the decision</h3>
              <FactorWeights weights={rec.factorWeights} />
            </section>
          )}

          {rec.resolvedBy && (
            <section className="rounded-md border border-line bg-surface p-4">
              <h3 className="mb-1.5">Resolved</h3>
              <p className="text-[13px] text-ink-secondary">
                By {rec.resolvedBy.name}
                {rec.resolvedAt ? ` ${relativeTime(rec.resolvedAt)}` : ""}.
              </p>
              {rec.rejectionReason && (
                <p className="mt-2 text-[13px] text-ink">{rec.rejectionReason}</p>
              )}
            </section>
          )}

          {rec.status === "AUTO_EXECUTED" && (
            <section className="rounded-md border border-line bg-surface p-4">
              <h3 className="mb-1.5">Executed automatically</h3>
              <p className="text-[13px] text-ink-secondary">
                No person approved this. Confidence cleared the organization threshold, so the
                system acted and recorded itself as the actor in the audit trail.
              </p>
            </section>
          )}
        </div>
      </div>

      {showReject && (
        <RejectDialog
          recommendation={rec}
          onClose={() => setShowReject(false)}
          isSubmitting={reject.isPending}
          onSubmit={(reason) =>
            reject.mutate(
              { id: rec.id, reason },
              {
                onSuccess: () => {
                  setShowReject(false);
                  void refetch();
                },
                onError: reportError,
              },
            )
          }
        />
      )}

      {!isPendingDecision && (
        <p className="mt-6 text-[13px] text-ink-tertiary">
          This recommendation is resolved and cannot be actioned again.{" "}
          <button
            type="button"
            onClick={() => navigate("/recommendations")}
            className="text-brand underline-offset-2 hover:underline"
          >
            Back to the queue
          </button>
        </p>
      )}
    </div>
  );
}

function AgentRunRow({ run }: { run: AgentRunDto }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-100 hover:bg-surface-hover"
      >
        <span className="flex-1 text-[13px]">{AGENT_DISPLAY_NAMES[run.agentName]}</span>
        {run.confidence !== null && <ConfidenceBadge value={run.confidence} />}
        <span className="tnum w-12 text-right font-mono text-[11px] text-ink-tertiary">
          {duration(run.durationMs)}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-ink-tertiary transition-transform duration-200", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="space-y-2 bg-canvas px-4 py-3">
          {run.error && <p className="text-[12px] text-down">{run.error}</p>}

          {run.toolCalls.length > 0 && (
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-tertiary">
                Tools called
              </p>
              {run.toolCalls.map((call, i) => (
                <p key={i} className="font-mono text-[11px] text-ink-secondary">
                  {call.name}({JSON.stringify(call.args)})
                  <span className="ml-2 text-ink-tertiary">{call.durationMs}ms</span>
                </p>
              ))}
            </div>
          )}

          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-tertiary">
              Output
            </p>
            <pre className="max-h-56 overflow-auto rounded-sm border border-line p-2 font-mono text-[11px] leading-relaxed text-ink-secondary">
              {JSON.stringify(run.output, null, 2)}
            </pre>
          </div>

          <p className="font-mono text-[10px] text-ink-tertiary">
            {run.model} · {run.promptTokens} + {run.completionTokens} tokens
          </p>
        </div>
      )}
    </li>
  );
}
