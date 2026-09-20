import { Fragment, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react";
import { api, queryString, type Paged } from "@/lib/api";
import { Page } from "@/components/layout/Page";
import { EmptyFirstRun, EmptyNoMatches, ErrorState } from "@/components/data/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/useAuth";
import { auditActor, auditLabel, type AuditTone } from "@/lib/auditLabels";
import { absoluteTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/hooks/useDebounced";
import type { AuditLogDto } from "@/lib/types";

/**
 * Activity.
 *
 * The audit trail is this product's trust surface: it is where a human checks
 * what the automation did while they were not looking. It previously rendered
 * the database directly, so a user read `PRICE_APPROVED_AND_EXECUTED` beside
 * `PricingRecommendation`, and expanding a row produced two JSON blobs. That
 * is traceable without being legible, which is the opposite of what a trust
 * surface is for.
 *
 * Every row is now a sentence with an actor. The raw event name and id are
 * still one disclosure away, because a reviewer auditing the auditor needs
 * them and nothing should be lost in the translation.
 *
 * Named Activity, matching the rail. It used to be titled "Audit trail" while
 * the nav item beside it said Activity.
 */
export function AuditPage() {
  const { session } = useAuth();
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // The input keeps its own immediate state; only the settled copy reaches the
  // query key, so typing stays responsive and does not fire a request per
  // keystroke.
  const settledSearch = useDebounced(search);
  const hasFilters = action !== "" || settledSearch !== "" || from !== "" || to !== "";

  function clearFilters() {
    setAction("");
    setSearch("");
    setFrom("");
    setTo("");
  }

  const { data: actions } = useQuery({
    queryKey: ["audit", "actions"],
    queryFn: ({ signal }) => api.get<string[]>("/audit-logs/actions", signal),
    staleTime: 5 * 60_000,
  });

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
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
    <Page
      title="Activity"
      subtitle="Every state change, who caused it, and what it changed. Append only, so nothing here can be edited or removed."
      actions={
        <span className="tnum font-mono text-[11px] text-t4">
          {entries.length > 0 ? `${entries.length} loaded` : ""}
        </span>
      }
    >
      {/* One row. This used to be a search box, a select and two bare date
          inputs showing dd/mm/yyyy placeholders, which took a third of the
          screen before a single event was visible. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            // Says what it actually matches. The trail has no relation to the
            // user table, so promising a name search would be a lie.
            placeholder="Search action, entity or id"
            aria-label="Search the activity trail"
            className="w-full pl-8 sm:w-64"
          />
        </div>

        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filter by event"
          className="h-8 rounded-md border border-border bg-input px-2 text-[13px] text-t1 transition-colors duration-[110ms] hover:border-border-strong"
        >
          <option value="">All events</option>
          {(actions ?? []).map((a) => (
            <option key={a} value={a}>
              {auditLabel(a).tag} · {auditLabel(a).sentence}
            </option>
          ))}
        </select>

        <span className="flex items-center gap-1.5 rounded-md border border-border bg-input px-2 text-[11.5px] text-t4">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
            className="h-[30px] bg-transparent text-[12px] text-t1 outline-none"
          />
          <span aria-hidden="true" className="text-t5">
            to
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
            className="h-[30px] bg-transparent text-[12px] text-t1 outline-none"
          />
        </span>

        {hasFilters && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel">
        {isPending && (
          <ul>
            {Array.from({ length: 10 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line2 px-4 py-2.5 last:border-0">
                <Skeleton className="h-2.5 w-12" />
                <Skeleton className="h-[19px] w-[19px] rounded-tag" />
                <Skeleton className="h-2.5 w-64" />
                <Skeleton className="ml-auto h-4 w-16 rounded-tag" />
              </li>
            ))}
          </ul>
        )}

        {isError && (
          <ErrorState
            description={error instanceof Error ? error.message : "Could not load the activity trail."}
            onRetry={() => void refetch()}
          />
        )}

        {/* Two states, because they are two situations. An empty trail needs
            to explain what will fill it; an over-filtered one needs a way back
            out. One generic "No results" serves neither. */}
        {!isPending && !isError && entries.length === 0 && !hasFilters && (
          <EmptyFirstRun
            title="Nothing recorded yet"
            description="Approving, rejecting or changing a setting will appear here."
          />
        )}

        {!isPending && !isError && entries.length === 0 && hasFilters && (
          <EmptyNoMatches
            title="No activity matches these filters"
            description="Try a wider date range, or clear the filters to see the whole trail."
            action={{ label: "Clear filters", onClick: clearFilters }}
          />
        )}

        <ul>
          {entries.map((entry, index) => {
            const day = dayBucket(entry.createdAt);
            const newDay = index === 0 || day !== dayBucket(entries[index - 1]!.createdAt);
            return (
              <Fragment key={entry.id}>
                {newDay && (
                  // Sticky, so you always know which day you are reading while
                  // scrolling a long trail.
                  <li className="sticky top-0 z-10 border-y border-line bg-chrome px-4 py-1.5 first:border-t-0">
                    <span className="eyebrow">{day}</span>
                  </li>
                )}
                <AuditRow entry={entry} currentUserId={session?.user.id} />
              </Fragment>
            );
          })}
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
    </Page>
  );
}

/** TODAY / YESTERDAY / an absolute date. Relative labels only for the two days
 *  a reader can hold in their head without doing arithmetic. */
function dayBucket(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (day === startOfToday) return "TODAY";
  if (day === startOfToday - 86_400_000) return "YESTERDAY";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
}

const TAG_TONE: Record<AuditTone, string> = {
  pos: "bg-pos-a text-pos",
  neg: "bg-neg-a text-neg",
  amber: "bg-amber-a text-amber",
  accent: "bg-acc-a text-acc-t2",
  neutral: "border border-line text-t4",
};

function AuditRow({
  entry,
  currentUserId,
}: {
  entry: AuditLogDto;
  currentUserId: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const label = auditLabel(entry.action);
  const actor = auditActor(entry.userId, currentUserId, entry.userName);
  const fields = diffFields(entry.beforeValue, entry.afterValue);
  const expandable = fields.length > 0;

  return (
    <li className="border-b border-line2 last:border-0">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-[110ms]",
          expandable ? "hover:bg-hover" : "cursor-default",
        )}
      >
        <span
          className="tnum hidden w-[52px] shrink-0 font-mono text-[10.5px] text-t5 sm:block"
          title={absoluteTime(entry.createdAt)}
        >
          {new Date(entry.createdAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>

        {/* Pricewise itself is marked in the accent; a person is neutral. That
            distinction is the whole point of the trail, so it is carried by
            the actor chip rather than left to inference from a missing name. */}
        <span
          aria-hidden="true"
          className={cn(
            "grid h-[19px] w-[19px] shrink-0 place-items-center rounded-tag font-mono text-[8.5px] font-medium",
            actor.isSystem ? "bg-acc-a text-acc-t2" : "bg-avatar-bg text-t2",
          )}
        >
          {actor.initials}
        </span>

        <span className="min-w-0 flex-1 truncate text-[12.5px] text-t2">
          <span className="font-medium text-t0">{actor.name}</span> {label.sentence}
        </span>

        <span
          className={cn(
            "hidden shrink-0 rounded-tag px-1.5 py-0.5 font-mono text-[9.5px] font-medium tracking-[0.06em] sm:inline-block",
            TAG_TONE[label.tone],
          )}
        >
          {label.tag}
        </span>

        <span className="w-[68px] shrink-0 text-right font-mono text-[10.5px] text-t5">
          {relativeTime(entry.createdAt)}
        </span>

        <ChevronDown
          size={13}
          strokeWidth={1.4}
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-transform duration-200",
            expandable ? "text-t4" : "invisible",
            open && "rotate-180",
          )}
        />
      </button>

      {open && expandable && (
        <div className="pw-in border-t border-line2 bg-inset px-4 py-3">
          {/* A field grid, not JSON.stringify. Only the keys that actually
              changed, because a dump of every unchanged field is how the
              important one gets missed. */}
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr_1fr]">
            <dt className="eyebrow self-center">Field</dt>
            <dd className="eyebrow">Before</dd>
            <dd className="eyebrow">After</dd>
            {fields.map((field) => (
              <Fragment key={field.key}>
                <dt className="self-center text-[12px] text-t3">{field.key}</dt>
                <dd className="tnum font-mono text-[11.5px] text-t4">{field.before}</dd>
                <dd className="tnum font-mono text-[11.5px] text-t1">{field.after}</dd>
              </Fragment>
            ))}
          </dl>

          <p className="mt-3 border-t border-line pt-2 font-mono text-[10px] text-t5">
            {entry.action} · {entry.entityType} · {entry.entityId}
          </p>

          {/* Nothing is lost in the translation to sentences. A reviewer
              auditing the auditor can still read exactly what was stored. */}
          <details className="mt-2">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-t4">
              Raw record
            </summary>
            <pre
              tabIndex={0}
              className="mt-1.5 max-h-56 overflow-auto rounded-sm border border-line bg-panel p-2 font-mono text-[11px] leading-relaxed text-t3"
            >
              {JSON.stringify({ before: entry.beforeValue, after: entry.afterValue }, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </li>
  );
}

interface DiffField {
  key: string;
  before: string;
  after: string;
}

/**
 * The keys that actually differ between the two snapshots.
 *
 * Both sides are `unknown` off the wire, so anything that is not a plain
 * object degrades to a single row rather than throwing. A trail that crashes
 * on an unexpected shape is worse than one that renders it plainly.
 */
function diffFields(before: unknown, after: unknown): DiffField[] {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  if (!isRecord(before) && !isRecord(after)) {
    if (before === null && after === null) return [];
    return [{ key: "value", before: show(before), after: show(after) }];
  }

  const left = isRecord(before) ? before : {};
  const right = isRecord(after) ? after : {};
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];

  return keys
    .filter((key) => show(left[key]) !== show(right[key]))
    .map((key) => ({ key, before: show(left[key]), after: show(right[key]) }));
}

function show(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
