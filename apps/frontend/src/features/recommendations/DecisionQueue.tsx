import { ConfidenceBadge, DeltaChip, Money } from "@/components/data/Metrics";
import { EmptyFirstRun, EmptyNoMatches } from "@/components/data/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ExportButton } from "./ExportButton";
import type { RecommendationDto } from "@/lib/types";

export const QUEUE_FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "AUTO_EXECUTED", label: "Auto" },
  { value: "REJECTED", label: "Rejected" },
] as const;

export type QueueFilter = (typeof QUEUE_FILTERS)[number]["value"];

/**
 * The left pane: what is waiting, densest-first.
 *
 * Sorted by confidence descending so the obvious decisions clear fast and
 * attention lands on the ambiguous ones. That ordering is the product's whole
 * argument about the analyst being a scarce resource.
 */
export function DecisionQueue({
  items,
  isPending,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  checked,
  onToggleCheck,
  onClearChecks,
  onApproveChecked,
  batchPending,
}: {
  items: RecommendationDto[];
  isPending: boolean;
  filter: QueueFilter;
  onFilterChange: (next: QueueFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  checked: Set<string>;
  onToggleCheck: (id: string) => void;
  onClearChecks: () => void;
  onApproveChecked: () => void;
  batchPending: boolean;
}) {
  return (
    <div className="flex w-[376px] shrink-0 flex-col border-r border-line bg-chrome">
      <div className="border-b border-line px-4 py-3">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-t0">Decisions</h1>
          <span className="tnum shrink-0 font-mono text-[11px] text-t4">
            {items.length} {filter === "PENDING" ? "pending" : "shown"}
          </span>
        </div>

        <div className="mb-2.5">
          <ExportButton status={filter} />
        </div>

        <div
          role="tablist"
          aria-label="Filter decisions"
          className="flex gap-0.5 rounded-md bg-panel p-0.5"
        >
          {QUEUE_FILTERS.map((option) => (
            <button
              key={option.value}
              role="tab"
              aria-selected={filter === option.value}
              onClick={() => onFilterChange(option.value)}
              className={cn(
                "flex-1 rounded-[5px] px-2 py-1 text-[11.5px] transition-colors duration-[110ms]",
                filter === option.value ? "bg-line3 text-t0" : "text-t4 hover:text-t2",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {checked.size > 0 && (
        <div className="flex items-center gap-2 border-b border-line bg-acc-a px-4 py-2">
          <span className="tnum flex-1 text-[12px] font-medium text-acc-t2">
            {checked.size} selected
          </span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11.5px]" onClick={onClearChecks}>
            Clear
          </Button>
          <Button
            size="sm"
            className="h-6 px-2 text-[11.5px]"
            onClick={onApproveChecked}
            disabled={batchPending}
          >
            {batchPending ? "Approving" : "Approve all"}
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending && (
          <ul>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="space-y-1.5 border-b border-line2 px-3 py-[11px]">
                <Skeleton className="h-3 w-44" />
                <Skeleton className="h-2.5 w-52" />
                <Skeleton className="h-0.5 w-full" />
              </li>
            ))}
          </ul>
        )}

        {!isPending && items.length === 0 && filter === "PENDING" && (
          <EmptyFirstRun
            title="Queue clear"
            description="Pricewise keeps watching. You will be brought back in when something needs judgment."
          />
        )}

        {!isPending && items.length === 0 && filter !== "PENDING" && (
          <EmptyNoMatches
            title="Nothing with this status"
            description="Try another filter to see the rest of the history."
            action={{ label: "Show pending", onClick: () => onFilterChange("PENDING") }}
          />
        )}

        <ul>
          {items.map((rec) => (
            <QueueCard
              key={rec.id}
              rec={rec}
              selected={rec.id === selectedId}
              checked={checked.has(rec.id)}
              onSelect={() => onSelect(rec.id)}
              onToggleCheck={() => onToggleCheck(rec.id)}
              showCheckbox={filter === "PENDING"}
            />
          ))}
        </ul>
      </div>

      <p className="border-t border-line px-4 py-2 font-mono text-[10px] text-t5">
        J/K move &nbsp; A approve &nbsp; M modify &nbsp; R reject
      </p>
    </div>
  );
}

function QueueCard({
  rec,
  selected,
  checked,
  onSelect,
  onToggleCheck,
  showCheckbox,
}: {
  rec: RecommendationDto;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
  showCheckbox: boolean;
}) {
  return (
    <li
      className={cn(
        "relative border-b border-line2 transition-colors duration-[110ms]",
        selected ? "bg-sel" : "hover:bg-hover",
      )}
    >
      {/* The spine, not a border: it marks position without shifting layout. */}
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-acc2" />}

      <div className="flex items-start gap-2.5 px-3 py-[11px]">
        {showCheckbox && (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleCheck}
            aria-label={`Select ${rec.product?.sku}`}
            className="mt-0.5 h-[13px] w-[13px] shrink-0 accent-[var(--acc)]"
          />
        )}

        <button
          type="button"
          onClick={onSelect}
          aria-current={selected ? "true" : undefined}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[12.5px] font-medium text-t0">{rec.product?.name}</span>
            <DeltaChip fraction={rec.deltaPct} className="shrink-0 text-[11.5px]" />
          </span>

          <span className="mt-0.5 flex items-baseline gap-1.5 font-mono text-[10.5px] text-t4">
            <span>{rec.product?.sku}</span>
            <span aria-hidden="true">·</span>
            <Money value={rec.currentPriceAtTime} className="text-t5" />
            <span aria-hidden="true">→</span>
            <Money value={rec.recommendedPrice} className="text-t2" />
          </span>

          <span className="mt-2 flex items-center gap-2">
            <ConfidenceBar value={rec.confidenceScore} />
            <ConfidenceBadge value={rec.confidenceScore} />
            <span className="shrink-0 font-mono text-[10px] text-t5">
              {relativeTime(rec.createdAt)}
            </span>
          </span>
        </button>
      </div>
    </li>
  );
}

/** A 2px bar. Decorative on its own, which is why the number always sits next
 *  to it: status is never colour or length alone. */
function ConfidenceBar({ value }: { value: number }) {
  return (
    <span aria-hidden="true" className="h-0.5 flex-1 overflow-hidden rounded-full bg-line">
      <span
        className={cn(
          "block h-full rounded-full",
          value >= 0.85 ? "bg-pos" : value >= 0.7 ? "bg-amber" : "bg-neg",
        )}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </span>
  );
}
