import { useEffect, useState } from "react";
import { Check, Circle } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { AGENT_DISPLAY_NAMES, type AgentNameValue } from "@pricewise/shared";
import { cn } from "@/lib/cn";

/**
 * A scripted version of the real pipeline view, for the login screen.
 *
 * It is a product artefact rather than a marketing graphic: the same five
 * agents, the same states, the same order the orchestrator actually runs them
 * in. The only thing faked is the timing, so the screen shows what the app
 * does instead of claiming it.
 *
 * Execution order, matching the orchestrator: Market Intelligence and
 * Inventory & Cost run concurrently, then Demand, then Strategy, then
 * Compliance. Note AGENT_NAMES is not in that order, so it is spelled out.
 */
const ORDER: AgentNameValue[] = [
  "MARKET_INTELLIGENCE",
  "INVENTORY_COST",
  "DEMAND_FORECASTING",
  "PRICING_STRATEGY",
  "EXECUTION_COMPLIANCE",
];

const STEP_MS = 1100;
const HOLD_MS = 2600;

export function PipelinePreview() {
  const reducedMotion = useReducedMotion();
  // With reduced motion the loop never starts, so the panel renders as a
  // finished run. Still informative, just not moving.
  const [completed, setCompleted] = useState(reducedMotion ? ORDER.length : 0);

  useEffect(() => {
    if (reducedMotion) return;

    const timer = setInterval(() => {
      setCompleted((current) => (current > ORDER.length ? 0 : current + 1));
    }, STEP_MS);

    return () => clearInterval(timer);
  }, [reducedMotion]);

  // One extra step past the end holds the completed state briefly before the
  // loop restarts, so it does not snap back the instant it finishes.
  const running = completed < ORDER.length ? completed : -1;

  return (
    <div
      // Decorative. The real pipeline view announces progress properly; this
      // one would only be noise to a screen reader.
      aria-hidden="true"
      className="w-full max-w-sm rounded-lg border border-line bg-bg/60 p-3"
      style={{ animationDuration: `${HOLD_MS}ms` }}
    >
      <div className="mb-2.5 flex items-center justify-between px-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-t4">
          NW-ELEC-0007
        </span>
        <span className="tnum font-mono text-[10px] text-t4">
          {Math.min(completed, ORDER.length)} of {ORDER.length}
        </span>
      </div>

      <ol className="space-y-1">
        {ORDER.map((agent, index) => {
          const isDone = index < completed;
          const isRunning = index === running;

          return (
            <li
              key={agent}
              className={cn(
                "flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 transition-all duration-200",
                isRunning && "border-acc-border/30 bg-acc-a",
                isDone && "border-line bg-panel",
                !isDone && !isRunning && "border-dashed border-line opacity-60",
                // The two Wave 1 agents are bracketed together, because that
                // grouping is the architecture made visible.
                index === 1 && "ml-3",
              )}
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center">
                {isDone ? (
                  <Check className="h-3 w-3 text-pos" />
                ) : isRunning ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-acc" />
                ) : (
                  <Circle className="h-2.5 w-2.5 text-t4" />
                )}
              </span>

              <span
                className={cn(
                  "flex-1 text-[12px]",
                  isRunning && !reducedMotion && "shimmer",
                  isDone ? "text-t1" : "text-t3",
                )}
              >
                {AGENT_DISPLAY_NAMES[agent]}
              </span>

              {index === 0 && (
                <span className="font-mono text-[10px] text-t4">fast</span>
              )}
              {index === 3 && (
                <span className="font-mono text-[10px] text-t4">strong</span>
              )}
            </li>
          );
        })}
      </ol>

      <div
        className={cn(
          "mt-2.5 flex items-center justify-between rounded-md border border-line px-2.5 py-2 transition-opacity duration-300",
          completed >= ORDER.length ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="text-[12px] text-t3">Recommended</span>
        <span className="tnum font-mono text-[12px] font-medium text-t1">
          $1,194.83 <span className="text-t4">to</span> $1,132.08
        </span>
      </div>
    </div>
  );
}
