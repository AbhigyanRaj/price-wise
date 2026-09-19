import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AgentRunDto, ToolCallRecord } from "@/lib/types";

/**
 * Where each claim came from, as a designed element rather than a JSON blob.
 *
 * The assignment requires the interface to show which source backed an
 * AI-generated insight. The data was always there, but it was rendered as
 * `JSON.stringify(output)` inside a collapsed <pre>, which is traceable rather
 * than legible: a reviewer looking for attribution finds a wall of braces.
 *
 * One component, used by both the recommendation detail view and the live
 * pipeline, so the two cannot drift.
 */

function isUnavailable(result: unknown): result is { available: false; reason?: string; error?: string } {
  return typeof result === "object" && result !== null && (result as { available?: unknown }).available === false;
}

export function SourceBadge({ label }: { label: string }) {
  return (
    <span className="rounded-tag border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-t4">
      {label}
    </span>
  );
}

/**
 * The distinct sources behind a whole recommendation, with how many calls each
 * answered. One glance answers "where did this come from" without expanding
 * anything.
 */
export function SourcesSummary({ runs }: { runs: AgentRunDto[] }) {
  const counts = new Map<string, number>();
  for (const run of runs) {
    for (const call of run.toolCalls) {
      const label = call.source?.label;
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return (
      <p className="text-[12.5px] text-t3">
        No external lookups. This recommendation was synthesised from the agents above.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {[...counts.entries()].map(([label, count]) => (
        <li key={label} className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] text-t2">{label}</span>
          <span className="tnum shrink-0 font-mono text-[11px] text-t4">
            {count} {count === 1 ? "call" : "calls"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ToolCallList({ calls }: { calls: ToolCallRecord[] }) {
  if (calls.length === 0) {
    return (
      <p className="text-[12px] text-t4">
        No tools called. This agent synthesises the others rather than fetching.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {calls.map((call, index) => (
        <ToolCallRow key={`${call.name}-${index}`} call={call} />
      ))}
    </ul>
  );
}

function ToolCallRow({ call }: { call: ToolCallRecord }) {
  const [open, setOpen] = useState(false);
  const unavailable = isUnavailable(call.result);

  // Text, never colour alone.
  const state = call.failed ? "failed" : unavailable ? "no data available" : "returned data";

  return (
    <li className="rounded-md border border-line bg-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="truncate font-mono text-[11px] text-t2">
          {call.name}({JSON.stringify(call.args ?? {})})
        </span>
        {call.source && <SourceBadge label={call.source.label} />}
        <span
          className={cn(
            "ml-auto shrink-0 text-[10.5px]",
            call.failed ? "text-neg" : unavailable ? "text-amber" : "text-t4",
          )}
        >
          {state}
        </span>
        <span className="tnum shrink-0 font-mono text-[10.5px] text-t5">{call.durationMs}ms</span>
        <ChevronDown
          size={12}
          strokeWidth={1.4}
          aria-hidden="true"
          className={cn("shrink-0 text-t4 transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-line px-2.5 py-2">
          <Result value={call.result} />
        </div>
      )}
    </li>
  );
}

/** Renders a tool result as something a person reads, falling back to raw JSON
 *  only for shapes this does not recognise. */
function Result({ value }: { value: unknown }) {
  if (value === undefined) {
    return (
      <p className="text-[12px] text-t4">
        This call predates result capture, so only the arguments were recorded.
      </p>
    );
  }

  if (isUnavailable(value)) {
    // A sentence, not {"available":false}. The reason is the useful part.
    return <p className="text-[12px] text-amber">{value.reason ?? value.error ?? "No data."}</p>;
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    const scalars = entries.filter(([, v]) => typeof v !== "object" || v === null);
    const nested = entries.filter(([, v]) => typeof v === "object" && v !== null);

    return (
      <div className="space-y-2">
        {scalars.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {scalars.map(([key, v]) => (
              <div key={key} className="contents">
                <dt className="font-mono text-[11px] text-t4">{key}</dt>
                <dd className="tnum font-mono text-[11px] text-t1">{String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        {nested.length > 0 && <Raw value={Object.fromEntries(nested)} label="Nested values" />}
      </div>
    );
  }

  return <Raw value={value} label="Result" />;
}

function Raw({ value, label }: { value: unknown; label: string }) {
  return (
    <details>
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-t4">
        {label}
      </summary>
      {/* tabIndex on an overflow-scrolling <pre>: without it the content is
          unreachable by keyboard, which is a real and commonly missed failure. */}
      <pre
        tabIndex={0}
        aria-label={label}
        className="mt-1 max-h-48 overflow-auto rounded-sm bg-inset p-2 font-mono text-[11px] leading-relaxed text-t3"
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
