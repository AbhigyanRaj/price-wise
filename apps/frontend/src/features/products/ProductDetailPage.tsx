import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Sparkles, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { money, percent } from "@/lib/format";
import { DeltaChip, InventoryBadge, MarginCell, Money } from "@/components/data/Metrics";
import { ErrorState, FullPageSpinner } from "@/components/data/States";
import { Button } from "@/components/ui/button";
import { AgentPipeline } from "@/features/recommendations/AgentPipeline";
import { useAgentStream } from "@/features/recommendations/useAgentStream";
import { useProduct } from "./api";

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const { data: product, isPending, isError, error, refetch } = useProduct(productId);
  const { agents, status, result, error: streamError, start, completedCount } = useAgentStream();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  if (isPending) return <FullPageSpinner />;
  if (isError || !product) {
    return (
      <ErrorState
        description={error instanceof Error ? error.message : "Product not found."}
        onRetry={() => void refetch()}
      />
    );
  }

  const competitor = product.latestCompetitorPrice;
  const competitorDelta = competitor
    ? (competitor.price - product.currentPrice) / product.currentPrice
    : null;

  async function simulate(eventType: string) {
    await api.post(`/products/${productId}/simulate-market-event`, { eventType });
    // The product's competitor data just changed, so anything derived from it
    // is stale.
    await queryClient.invalidateQueries({ queryKey: ["products"] });
  }

  async function handleGenerate() {
    await start(productId!);
    // A completed run wrote a new recommendation and may have changed the
    // price, so the catalog and queue are both stale now.
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    await queryClient.invalidateQueries({ queryKey: ["recommendations"] });
  }

  return (
    <div className="p-6">
      <Link
        to="/products"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-secondary transition-colors duration-100 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Catalog
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs text-ink-tertiary">{product.sku}</p>
          <h1>{product.name}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{product.category}</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            onChange={(e) => {
              if (e.target.value) void simulate(e.target.value);
              e.target.value = "";
            }}
            aria-label="Simulate a market event"
            defaultValue=""
            className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] transition-colors duration-100 hover:border-line-strong"
          >
            <option value="" disabled>
              Simulate event
            </option>
            <option value="competitor_price_drop">Competitor drops 15%</option>
            <option value="competitor_price_increase">Competitor raises 12%</option>
            <option value="demand_spike">Demand spike</option>
            <option value="new_competitor">New competitor enters</option>
          </select>

          <Button size="sm" onClick={handleGenerate} disabled={status === "streaming"}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {status === "streaming" ? "Running" : "Generate recommendation"}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="space-y-4">
          <div className="rounded-md border border-line bg-surface">
            <h3 className="border-b border-line px-4 py-2.5 text-sm">Position</h3>
            <dl className="divide-y divide-line">
              <Row label="Current price">
                <Money value={product.currentPrice} />
              </Row>
              <Row label="Unit cost">
                <Money value={product.cost} className="text-ink-secondary" />
              </Row>
              <Row label="Margin">
                <MarginCell margin={product.margin} belowFloor={product.belowFloor} />
              </Row>
              <Row label="Margin floor">
                <span className="tnum text-ink-secondary">
                  {percent(product.marginFloorPct, 1)}
                </span>
              </Row>
              <Row label="Floor price">
                <span className="tnum font-mono text-ink-secondary">
                  {money(product.cost / (1 - product.marginFloorPct))}
                </span>
              </Row>
              <Row label="Inventory">
                <InventoryBadge status={product.inventoryStatus} level={product.inventoryLevel} />
              </Row>
              <Row label="Latest competitor">
                {competitor && competitorDelta !== null ? (
                  <span className="inline-flex items-center gap-2">
                    <Money value={competitor.price} className="text-ink-secondary" />
                    <DeltaChip fraction={competitorDelta} />
                  </span>
                ) : (
                  <span className="text-xs text-ink-tertiary">no data</span>
                )}
              </Row>
            </dl>
          </div>
        </section>

        <section>
          {status === "idle" && !product.pendingRecommendation && (
            <div className="rounded-md border border-dashed border-line px-6 py-12 text-center">
              <Zap className="mx-auto mb-3 h-7 w-7 text-ink-tertiary" aria-hidden="true" />
              <p className="text-sm font-medium">No recommendation yet</p>
              <p className="mx-auto mt-1 max-w-xs text-[13px] text-ink-secondary">
                Run the five-agent pipeline to analyse this product against the market, your costs
                and current demand.
              </p>
            </div>
          )}

          {status === "idle" && product.pendingRecommendation && (
            <div className="rounded-md border border-line bg-surface p-4">
              <p className="text-sm font-medium">A recommendation is waiting</p>
              <p className="mt-1 text-[13px] text-ink-secondary">
                Generated earlier and pending your decision.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() =>
                  navigate(`/recommendations/${product.pendingRecommendation?.id ?? ""}`)
                }
              >
                Open recommendation
              </Button>
            </div>
          )}

          {status !== "idle" && (
            <AgentPipeline
              agents={agents}
              completedCount={completedCount}
              isStreaming={status === "streaming"}
            />
          )}

          {streamError && (
            <div className="mt-3 rounded-md border border-down/40 bg-down-wash p-3">
              <p className="text-[13px] text-down">{streamError}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={handleGenerate}>
                Try again
              </Button>
            </div>
          )}

          {result && (
            <div className="mt-3 rounded-md border border-line bg-surface p-4">
              <p className="text-sm font-medium">
                {result.blocked
                  ? "Blocked by a business rule"
                  : result.autoExecuted
                    ? "Auto-executed"
                    : "Sent for your approval"}
              </p>
              <p className="mt-1 text-[13px] text-ink-secondary">
                {result.blocked
                  ? "The rule engine stopped this from executing. It is waiting for a human decision."
                  : result.autoExecuted
                    ? "Confidence cleared your organization's threshold, so the price is already updated."
                    : result.executionFailed
                      ? "The platform rejected the change and it was rolled back. It is back in the queue."
                      : "Confidence was below your threshold, so it is waiting in the approval queue."}
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => navigate(`/recommendations/${result.recommendationId}`)}
              >
                View the full reasoning
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <dt className="text-[13px] text-ink-secondary">{label}</dt>
      <dd className="text-[13px]">{children}</dd>
    </div>
  );
}
