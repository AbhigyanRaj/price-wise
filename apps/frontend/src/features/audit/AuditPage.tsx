import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { api, queryString, type Paged } from "@/lib/api";
import { EmptyFirstRun, ErrorState } from "@/components/data/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { absoluteTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AuditLogDto } from "@/lib/types";

export function AuditPage() {
  const [action, setAction] = useState("");

  const { data: actions } = useQuery({
    queryKey: ["audit", "actions"],
    queryFn: ({ signal }) => api.get<string[]>("/audit-logs/actions", signal),
    staleTime: 5 * 60_000,
  });

  const { data, isPending, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["audit", { action }],
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) =>
        api.paged<AuditLogDto>(
          `/audit-logs${queryString({ action, limit: 25, cursor: pageParam })}`,
          signal,
        ),
      getNextPageParam: (last: Paged<AuditLogDto>) => last.pagination.nextCursor ?? undefined,
    });

  const entries = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1>Audit trail</h1>
        <p className="mt-0.5 text-sm text-ink-secondary">
          Every state change, who caused it, and what it changed. Append only.
        </p>
      </header>

      <div className="mb-3">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filter by action"
          className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] transition-colors duration-100 hover:border-line-strong"
        >
          <option value="">All actions</option>
          {(actions ?? []).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-surface">
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

        {!isPending && !isError && entries.length === 0 && (
          <EmptyFirstRun
            title="Nothing recorded yet"
            description="Approving, rejecting or changing settings will appear here."
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
          hasDiff && "hover:bg-surface-hover",
        )}
      >
        <span className="font-mono text-[11px] text-ink">{entry.action}</span>
        <span className="flex-1 truncate text-[13px] text-ink-secondary">
          {entry.entityType}
          {/* A null actor means the system acted, which is how an auto-executed
              price change is distinguished from a human approval. */}
          {entry.userId === null && (
            <span className="ml-2 rounded-sm bg-brand-wash px-1.5 py-0.5 text-[11px] text-brand">
              System
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs text-ink-tertiary" title={absoluteTime(entry.createdAt)}>
          {relativeTime(entry.createdAt)}
        </span>
        {hasDiff && (
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-ink-tertiary transition-transform duration-200", open && "rotate-180")}
            aria-hidden="true"
          />
        )}
      </button>

      {open && hasDiff && (
        <div className="grid gap-3 bg-canvas px-4 py-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-tertiary">Before</p>
            <pre className="overflow-auto rounded-sm border border-line p-2 font-mono text-[11px] text-ink-secondary">
              {JSON.stringify(entry.beforeValue, null, 2) ?? "null"}
            </pre>
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-tertiary">After</p>
            <pre className="overflow-auto rounded-sm border border-line p-2 font-mono text-[11px] text-ink-secondary">
              {JSON.stringify(entry.afterValue, null, 2) ?? "null"}
            </pre>
          </div>
        </div>
      )}
    </li>
  );
}
