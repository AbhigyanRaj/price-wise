import { useState } from "react";
import { useNavigate } from "react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, Sparkles } from "lucide-react";
import {
  ConfidenceBadge,
  DeltaChip,
  InventoryBadge,
  MarginCell,
  Money,
} from "@/components/data/Metrics";
import { EmptyFirstRun, EmptyNoMatches, ErrorState } from "@/components/data/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { DEFAULT_FILTERS, useCategories, useProducts, type CatalogFilters } from "./api";
import { ProductFormDialog } from "./ProductFormDialog";
import { DeleteProductDialog } from "./DeleteProductDialog";
import { useAuth } from "@/features/auth/useAuth";
import type { ProductDto } from "@/lib/types";

type SortableColumn = CatalogFilters["sortBy"];

const COLUMNS: {
  key: string;
  label: string;
  numeric?: boolean;
  sortBy?: SortableColumn;
  width: string;
}[] = [
  { key: "sku", label: "SKU", width: "w-36" },
  { key: "name", label: "Product", sortBy: "name", width: "" },
  { key: "price", label: "Price", numeric: true, sortBy: "currentPrice", width: "w-28" },
  { key: "competitor", label: "Competitor", numeric: true, width: "w-32" },
  { key: "margin", label: "Margin", numeric: true, width: "w-24" },
  { key: "inventory", label: "Inventory", numeric: true, sortBy: "inventoryLevel", width: "w-36" },
  { key: "rec", label: "Recommendation", width: "w-36" },
  { key: "actions", label: "", width: "w-20" },
];

export function CatalogPage() {
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useProducts(filters);
  const { data: categories } = useCategories();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  // Hiding these is UX only. requireRole("ADMIN") rejects an analyst who
  // crafts the request regardless of what this renders.
  const [formFor, setFormFor] = useState<ProductDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<ProductDto | null>(null);

  const hasActiveFilters =
    filters.search !== "" || filters.category !== "" || filters.inventoryStatus !== "";

  function update(patch: Partial<CatalogFilters>) {
    // Any filter change returns to page one. Staying on page 7 of a result set
    // that now has two pages shows an empty table for no reason.
    setFilters((current) => ({ ...current, page: 1, ...patch }));
  }

  function toggleSort(column: SortableColumn) {
    setFilters((current) => ({
      ...current,
      page: 1,
      sortBy: column,
      sortDir: current.sortBy === column && current.sortDir === "asc" ? "desc" : "asc",
    }));
  }

  return (
    <div className="p-6">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1>Catalog</h1>
          <p className="mt-0.5 text-sm text-t3">
            Every SKU in your organization, with its current market position.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {data && (
            <span className="tnum text-xs text-t4">
              {data.pagination.totalCount} products
            </span>
          )}
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => {
                setFormFor(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add product
            </Button>
          )}
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4"
            aria-hidden="true"
          />
          <Input
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search SKU or name"
            aria-label="Search products"
            className="h-8 w-56 pl-8 text-[13px]"
          />
        </div>

        <FilterSelect
          label="Category"
          value={filters.category}
          onChange={(category) => update({ category })}
          options={(categories ?? []).map((c) => ({ value: c, label: c }))}
        />
        <FilterSelect
          label="Inventory"
          value={filters.inventoryStatus}
          onChange={(inventoryStatus) => update({ inventoryStatus })}
          options={[
            { value: "LOW", label: "Low" },
            { value: "NORMAL", label: "Normal" },
            { value: "OVERSTOCKED", label: "Overstocked" },
          ]}
        />

        {hasActiveFilters && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-[13px]"
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-panel">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "h-8 px-3 text-xs font-medium text-t4",
                    // Numeric headers align right with their cells. A
                    // left-aligned header over a right-aligned column is the
                    // commonest reason a data table reads as crooked.
                    column.numeric ? "text-right" : "text-left",
                    column.width,
                  )}
                >
                  {column.sortBy ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.sortBy!)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm transition-colors duration-100 hover:text-t1",
                        filters.sortBy === column.sortBy && "text-t1",
                      )}
                      aria-label={`Sort by ${column.label}`}
                    >
                      {column.label}
                      {filters.sortBy === column.sortBy &&
                        (filters.sortDir === "asc" ? (
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        ))}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody
            // Dimmed while a new page loads, so the stale rows read as stale
            // rather than pretending to be current.
            className={cn("transition-opacity duration-150", isPlaceholderData && "opacity-60")}
          >
            {isPending && <SkeletonRows />}

            {!isPending &&
              data?.items.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  onOpen={() => navigate(`/products/${product.id}`)}
                  isAdmin={isAdmin}
                  onEdit={() => {
                    setFormFor(product);
                    setFormOpen(true);
                  }}
                  onDelete={() => setDeleting(product)}
                />
              ))}
          </tbody>
        </table>

        {isError && (
          <ErrorState
            description={error instanceof Error ? error.message : "Could not load the catalog."}
            onRetry={() => void refetch()}
          />
        )}

        {/* Two genuinely different situations, two different messages. Merging
            them into one "No results" is the classic empty-state mistake: one
            needs an onboarding action, the other needs a way out of a filter. */}
        {!isPending && !isError && data?.items.length === 0 && hasActiveFilters && (
          <EmptyNoMatches
            title="No products match these filters"
            description="Try a different category or clear the filters to see the whole catalog."
            action={{ label: "Clear filters", onClick: () => setFilters(DEFAULT_FILTERS) }}
          />
        )}

        {!isPending && !isError && data?.items.length === 0 && !hasActiveFilters && (
          <EmptyFirstRun
            title="No products yet"
            description="Seed the demo catalog with bun run db:seed, or add your first product."
          />
        )}
      </div>

      {data && data.pagination.totalPages > 1 && (
        <nav
          className="mt-3 flex items-center justify-between text-[13px]"
          aria-label="Catalog pages"
        >
          <span className="tnum text-t4">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={filters.page <= 1}
              onClick={() => setFilters((c) => ({ ...c, page: c.page - 1 }))}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={filters.page >= data.pagination.totalPages}
              onClick={() => setFilters((c) => ({ ...c, page: c.page + 1 }))}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={formFor ?? undefined}
      />
      <DeleteProductDialog product={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function ProductRow({
  product,
  onOpen,
  isAdmin,
  onEdit,
  onDelete,
}: {
  product: ProductDto;
  onOpen: () => void;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const competitor = product.latestCompetitorPrice;
  // Our position relative to the market, computed here only for display. The
  // agents compute their own from the same source data.
  const competitorDelta = competitor
    ? (competitor.price - product.currentPrice) / product.currentPrice
    : null;

  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        // A row that is clickable must also be operable from the keyboard, or
        // the whole screen is unusable without a mouse.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="h-9 cursor-pointer border-b border-line transition-colors duration-100 last:border-0 hover:bg-hover"
    >
      <td className="px-3 font-mono text-xs text-t3">{product.sku}</td>
      <td className="max-w-0 truncate px-3" title={product.name}>
        {product.name}
      </td>
      <td className="px-3 text-right">
        <Money value={product.currentPrice} />
      </td>
      <td className="px-3 text-right">
        {competitor && competitorDelta !== null ? (
          <span
            className="inline-flex items-center gap-1.5"
            title={`${competitor.competitor} at ${competitor.price}`}
          >
            <Money value={competitor.price} className="text-t3" />
            <DeltaChip fraction={competitorDelta} />
          </span>
        ) : (
          <span className="text-xs text-t4">no data</span>
        )}
      </td>
      <td className="px-3 text-right">
        <MarginCell margin={product.margin} belowFloor={product.belowFloor} />
      </td>
      <td className="px-3 text-right">
        <InventoryBadge status={product.inventoryStatus} level={product.inventoryLevel} />
      </td>
      <td className="px-3">
        {product.pendingRecommendation ? (
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-acc-t2" aria-hidden="true" />
            <ConfidenceBadge value={product.pendingRecommendation.confidenceScore} />
          </span>
        ) : (
          <span className="text-xs text-t4">none</span>
        )}
      </td>
      <td className="px-3 text-right">
        {isAdmin && (
          <span className="inline-flex items-center gap-0.5">
            <button
              type="button"
              aria-label={`Edit ${product.sku}`}
              // The row itself is clickable and Enter-activated, so both of
              // these must stop the event reaching it.
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="rounded-sm p-1 text-t4 transition-colors duration-[110ms] hover:bg-hover hover:text-t1"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${product.sku}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded-sm p-1 text-t4 transition-colors duration-[110ms] hover:bg-neg-a hover:text-neg"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

/** Skeleton widths deliberately mirror the real columns, so nothing shifts
 *  when the data lands. A centred spinner would cause a visible jump. */
function SkeletonRows() {
  const widths = ["w-24", "w-48", "w-16", "w-24", "w-12", "w-20", "w-16", "w-10"];

  return (
    <>
      {Array.from({ length: 8 }, (_, row) => (
        <tr key={row} className="h-9 border-b border-line last:border-0">
          {widths.map((width, cell) => (
            <td key={cell} className="px-3">
              <Skeleton className={cn("h-3", width, COLUMNS[cell]?.numeric && "ml-auto")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-8 rounded-md border border-line bg-panel px-2 text-[13px] text-t1 transition-colors duration-100 hover:border-line3"
    >
      <option value="">{label}: all</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
