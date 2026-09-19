import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react";
import { api, queryString, type Paged } from "@/lib/api";
import { EmptyFirstRun, EmptyNoMatches, ErrorState } from "@/components/data/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { absoluteTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/hooks/useDebounced";
import type { AuditLogDto } from "@/lib/types";

export function AuditPage() {
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // The input keeps its own immediate state; only the settled copy reaches the
  // query key, so typing stays responsive and does not fire a request per
  // keystroke.
  const settledSearch = useDebounced(search);
  const hasFilters = action !== "" || settledSearch !== "" || from !== "" || to !== "";

  const { data: actions } = useQuery({
    queryKey: ["audit", "actions"],
    queryFn: ({ signal }) => api.get<string[]>("/audit-logs/actions", signal),
    staleTime: 5 * 60_000,
  });

  const { data, isPending, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["audit", { action, search: settledSearch, from, to }],
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) =>
        api.paged<AuditLogDto>(
          `/audit-logs${queryString({
            action,
            search: settledSearch,
            // <input type="date"> yields YYYY-MM-DD; the API wants an ISO
            // datetime. Widening to the whole day at both ends is what makes
            // "from today to today" mean today.
            from: from ? `${from}T00:00:00.000Z` : "",
            to: to ? `${to}T23:59:59.999Z` : "",
            limit: 25,
            cursor: pageParam,
          })}`,
          signal,
        ),
      getNextPageParam: (last: Paged<AuditLogDto>) => last.pagination.nextCursor ?? undefined,
    });

  const entries = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1>Audit trail</h1>
        <p className="mt-0.5 text-sm text-t3">
          Every state change, who caused it, and what it changed. Append only.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            // Says what it actually matches. The trail has no relation to the
            // user table, so promising a name search would be a lie.
            placeholder="Search action, entity or id"
            aria-label="Search the audit trail"
            className="h-8 w-64 rounded-md border border-line bg-panel pl-8 pr-2 text-[13px] transition-colors duration-100 hover:border-line3"
          />
        </div>

        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filter by action"
          className="h-8 rounded-md border border-line bg-panel px-2 text-[13px] transition-colors duration-100 hover:border-line3"
        >
          <option value="">All actions</option>
          {(actions ?? []).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-[12px] text-t3">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 rounded-md border border-line bg-panel px-2 text-[13px]"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-t3">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 rounded-md border border-line bg-panel px-2 text-[13px]"
          />
        </label>

        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAction("");
              setSearch("");
              setFrom("");
              setTo("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-panel">
        {isPending && (
          <ul>
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="border-b border-line px-4 py-2.5 last:border-0">
                <Skeleton className="h-3 w-72" />
              </li>
            ))}
          </ul>
        )}

        {isError && (
          <ErrorState
            description={error instanceof Error ? error.message : "Could not load the audit trail."}
            onRetry={() => void refetch()}
          />
        )}

        {/* Two states, because they are two situations. An empty trail needs
            to explain what will fill it; an over-filtered one needs a way back
            out. One generic "No results" serves neither. */}
        {!isPending && !isError && entries.length === 0 && !hasFilters && (
          <EmptyFirstRun
            title="Nothing recorded yet"
            description="Approving, rejecting or changing settings will appear here."
          />
        )}

        {!isPending && !isError && entries.length === 0 && hasFilters && (
          <EmptyNoMatches
            title="No activity matches these filters"
            description="Try a wider date range, or clear the filters to see the whole trail."
            action={{
              label: "Clear filters",
              onClick: () => {
                setAction("");
                setSearch("");
                setFrom("");
                setTo("");
              },
            }}
          />
        )}

        <ul>
          {entries.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </ul>
      </div>

      {hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Loading" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogDto }) {
  const [open, setOpen] = useState(false);
  const hasDiff = entry.beforeValue !== null || entry.afterValue !== null;

  return (
    <li className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => hasDiff && setOpen((v) => !v)}
        aria-expanded={hasDiff ? open : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100",
          hasDiff && "hover:bg-hover",
        )}
      >
        <span className="font-mono text-[11px] text-t1">{entry.action}</span>
        <span className="flex-1 truncate text-[13px] text-t3">
          {entry.entityType}
          {/* A null actor means the system acted, which is how an auto-executed
              price change is distinguished from a human approval. */}
          {entry.userId === null && (
            <span className="ml-2 rounded-sm bg-acc-a px-1.5 py-0.5 text-[11px] text-acc-t2">
              System
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs text-t4" title={absoluteTime(entry.createdAt)}>
          {relativeTime(entry.createdAt)}
        </span>
        {hasDiff && (
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-t4 transition-transform duration-200", open && "rotate-180")}
            aria-hidden="true"
          />
        )}
      </button>

      {open && hasDiff && (
        <div className="grid gap-3 bg-bg px-4 py-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-t4">Before</p>
            <pre className="overflow-auto rounded-sm border border-line p-2 font-mono text-[11px] text-t3">
              {JSON.stringify(entry.beforeValue, null, 2) ?? "null"}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-t4">After</p>
            <pre className="overflow-auto rounded-sm border border-line p-2 font-mono text-[11px] text-t3">
              {JSON.stringify(entry.afterValue, null, 2) ?? "null"}
            </pre>
          </div>
        </div>
      )}
    </li>
  );
}
