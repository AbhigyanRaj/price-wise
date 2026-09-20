import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError, queryString, type Paged } from "@/lib/api";
import { downloadCsv, toCsv, type CsvColumn } from "@/lib/csv";
import type { RecommendationDto } from "@/lib/types";

/** Bounded. Each page is a request, and nobody opens a hundred-thousand-row
 *  spreadsheet to make a pricing decision. */
const MAX_ROWS = 1000;
const PAGE_SIZE = 100;

/**
 * Columns are values, not presentation.
 *
 * Prices are raw numbers and dates are ISO strings, so the spreadsheet can sum
 * a column and sort by date. Running money() over these would produce a file
 * that looks right and computes nothing.
 */
const COLUMNS: CsvColumn<RecommendationDto>[] = [
  { header: "SKU", value: (r) => r.product?.sku },
  { header: "Product", value: (r) => r.product?.name },
  { header: "Current price", value: (r) => r.currentPriceAtTime },
  { header: "Recommended price", value: (r) => r.recommendedPrice },
  { header: "Modified price", value: (r) => r.modifiedPrice },
  // A fraction, not "−3.6%": the reader can format it, but cannot un-format it.
  { header: "Delta", value: (r) => r.deltaPct },
  { header: "Confidence", value: (r) => r.confidenceScore },
  { header: "Status", value: (r) => r.status },
  { header: "Resolved by", value: (r) => r.resolvedBy?.name ?? (r.resolvedAt ? "system" : "") },
  { header: "Resolved at", value: (r) => r.resolvedAt },
  { header: "Created at", value: (r) => r.createdAt },
  { header: "Rationale", value: (r) => r.rationale },
];

export function ExportButton({ status }: { status: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setDone(null);

    try {
      // Walks the endpoint rather than reading the cache. The queue holds only
      // the pages already scrolled, so exporting the cache would silently give
      // the reader a partial file that looks complete.
      const rows: RecommendationDto[] = [];
      let cursor: string | undefined;

      do {
        const page: Paged<RecommendationDto> = await api.paged<RecommendationDto>(
          `/recommendations${queryString({ status, limit: PAGE_SIZE, cursor })}`,
        );
        rows.push(...page.items);
        cursor = page.pagination.nextCursor ?? undefined;
      } while (cursor && rows.length < MAX_ROWS);

      const capped = rows.slice(0, MAX_ROWS);
      const label = status ? status.toLowerCase() : "all";
      const today = new Date().toISOString().slice(0, 10);

      downloadCsv(`pricewise-decisions-${label}-${today}.csv`, toCsv(capped, COLUMNS));
      setDone(capped.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not build the export.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[11.5px]"
        onClick={() => void run()}
        disabled={busy}
        aria-busy={busy}
      >
        <Download className="h-3 w-3" aria-hidden="true" />
        {busy ? "Preparing" : "Export CSV"}
      </Button>

      {/* Polite: a download is a confirmation, not an interruption. */}
      <span role="status" aria-live="polite" className="text-[11px] text-t4">
        {done !== null && `Exported ${done}`}
      </span>
      {error && (
        <span role="alert" className="text-[11px] text-neg">
          {error}
        </span>
      )}
    </span>
  );
}
