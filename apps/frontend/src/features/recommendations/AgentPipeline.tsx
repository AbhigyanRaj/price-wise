import { useEffect, useState } from "react";
import { AlertCircle, Check, ChevronDown, Circle, MinusCircle } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { AGENT_DISPLAY_NAMES, type AgentNameValue } from "@pricewise/shared";
import { cn } from "@/lib/cn";
import { duration } from "@/lib/format";
import { ConfidenceBadge } from "@/components/data/Metrics";
import { ToolCallList } from "@/components/data/ToolCallList";
import { PIPELINE_ORDER, WAVE_ONE, type AgentProgress } from "./useAgentStream";

/** Ticks while an agent is running so the elapsed time is live rather than
 *  frozen. An always-visible timer is the trust signal that matters more than
 *  any animation: it proves work is happening. */
function useElapsed(startedAt: number | null, isRunning: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning || startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [isRunning, startedAt]);

  return startedAt === null ? 0 : now - startedAt;
}

export function AgentPipeline({
  agents,
  completedCount,
  isStreaming,
}: {
  agents: Record<AgentNameValue, AgentProgress>;
  completedCount: number;
  isStreaming: boolean;
}) {
  return (
    <section aria-label="Agent pipeline">
      <header className="mb-2 flex items-center justify-between">
        <h3>Agent pipeline</h3>
        <span className="tnum font-mono text-xs text-ink-tertiary">
          {completedCount} of {PIPELINE_ORDER.length}
        </span>
      </header>

      {/* Announced politely rather than assertively, so it does not interrupt
          whatever the user is reading. The message is coarse on purpose: one
          update per agent, not per token. */}
      <p className="sr-only" aria-live="polite">
        {isStreaming
          ? `${completedCount} of ${PIPELINE_ORDER.length} agents complete`
          : completedCount > 0
            ? "Pipeline finished"
            : ""}
      </p>

      <ol className="space-y-1.5">
        {PIPELINE_ORDER.map((agent, index) => (
          <li key={agent}>
            {index === 0 && (
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-tertiary">
                Wave 1, concurrent
              </p>
            )}
            {index === 2 && (
              <p className="mb-1 mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-tertiary">
                Wave 2, sequential
              </p>
            )}
            <AgentCard
              agent={agent}
              progress={agents[agent]}
              // The indent is not decoration. It shows that these two run at
              // the same time, which is the architecture made visible.
              grouped={WAVE_ONE.includes(agent)}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function AgentCard({
  agent,
  progress,
  grouped,
}: {
  agent: AgentNameValue;
  progress: AgentProgress;
  grouped: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = useReducedMotion();
  const isRunning = progress.state === "running";
  const elapsed = useElapsed(progress.startedAt, isRunning);

  const hasDetail = progress.state === "done" && progress.output !== null;

  return (
    <div
      className={cn(
        "rounded-md border transition-colors duration-200",
        grouped && "border-l-2",
        isRunning && "border-brand/30 bg-brand-wash",
        progress.state === "done" && "border-line bg-surface",
        progress.state === "pending" && "border-dashed border-line bg-surface/50 opacity-60",
        progress.state === "skipped" && "border-dashed border-line bg-surface/50",
        progress.state === "failed" && "border-down/40 bg-down-wash",
        grouped && isRunning && "border-l-brand",
      )}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        <StateGlyph state={progress.state} />

        <span
          className={cn(
            "flex-1 text-[13px]",
            // A shimmer reads as "processing". A spinner reads as "waiting",
            // which is a less honest thing to say while work is happening.
            isRunning && !reducedMotion && "shimmer",
            progress.state === "pending" ? "text-ink-secondary" : "text-ink",
          )}
        >
          {AGENT_DISPLAY_NAMES[agent]}
          {isRunning && reducedMotion && (
            <span className="ml-2 text-ink-secondary">Running</span>
          )}
        </span>

        {progress.confidence !== null && <ConfidenceBadge value={progress.confidence} />}

        {(isRunning || progress.durationMs !== null) && (
          <span className="tnum w-14 text-right font-mono text-[11px] text-ink-tertiary">
            {isRunning ? duration(elapsed) : duration(progress.durationMs ?? 0)}
          </span>
        )}

        {hasDetail && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${AGENT_DISPLAY_NAMES[agent]}`}
            className="rounded-sm p-0.5 text-ink-tertiary transition-colors duration-100 hover:text-ink"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {progress.message && (
        <p className="px-3 pb-2 text-[12px] text-ink-secondary">{progress.message}</p>
      )}

      {expanded && hasDetail && (
        <div className="space-y-2 border-t border-line px-3 py-2">
          <div>
            {/* The arguments and the source, not just the name. What the model
                actually asked for, and what answered it. */}
            <p className="eyebrow mb-1.5">Evidence</p>
            <ToolCallList calls={progress.toolCalls} />
          </div>

          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-ink-tertiary">
              Output
            </p>
            <pre className="max-h-48 overflow-auto rounded-sm bg-canvas p-2 font-mono text-[11px] leading-relaxed text-ink-secondary">
              {JSON.stringify(progress.output, null, 2)}
            </pre>
          </div>

          <p className="font-mono text-[10px] text-ink-tertiary">
            {progress.promptTokens} prompt + {progress.completionTokens} completion tokens
          </p>
        </div>
      )}
    </div>
  );
}

function StateGlyph({ state }: { state: AgentProgress["state"] }) {
  return (
    <span className="grid h-4 w-4 shrink-0 place-items-center">
      {state === "done" && <Check className="h-3.5 w-3.5 text-up" aria-label="Complete" />}
      {state === "running" && (
        <span className="h-2 w-2 rounded-full bg-brand" aria-label="Running" />
      )}
      {state === "pending" && (
        <Circle className="h-2.5 w-2.5 text-ink-tertiary" aria-label="Waiting" />
      )}
      {state === "skipped" && (
        <MinusCircle className="h-3.5 w-3.5 text-ink-tertiary" aria-label="Skipped" />
      )}
      {state === "failed" && <AlertCircle className="h-3.5 w-3.5 text-down" aria-label="Failed" />}
    </span>
  );
}
