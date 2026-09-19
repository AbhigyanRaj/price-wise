import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentNameValue } from "@pricewise/shared";
import { API_BASE } from "@/lib/api";
import { streamEvents } from "@/lib/sse";
import type { PipelineEvent, ToolCallRecord } from "@/lib/types";

/** Execution order as the orchestrator actually runs it. AGENT_NAMES from the
 *  shared package is not in this order, so it cannot be used as a stepper. */
export const PIPELINE_ORDER: AgentNameValue[] = [
  "MARKET_INTELLIGENCE",
  "INVENTORY_COST",
  "DEMAND_FORECASTING",
  "PRICING_STRATEGY",
  "EXECUTION_COMPLIANCE",
];

/** The two Wave 1 agents run concurrently and are grouped in the UI. */
export const WAVE_ONE: AgentNameValue[] = ["MARKET_INTELLIGENCE", "INVENTORY_COST"];

export type AgentState = "pending" | "running" | "done" | "skipped" | "failed";

export interface AgentProgress {
  state: AgentState;
  startedAt: number | null;
  durationMs: number | null;
  confidence: number | null;
  output: unknown;
  toolCalls: ToolCallRecord[];
  promptTokens: number;
  completionTokens: number;
  message: string | null;
}

export interface StreamResult {
  recommendationId: string;
  autoExecuted: boolean;
  blocked: boolean;
  executionFailed: boolean;
}

type Status = "idle" | "streaming" | "done" | "error";

const emptyProgress = (): AgentProgress => ({
  state: "pending",
  startedAt: null,
  durationMs: null,
  confidence: null,
  output: null,
  toolCalls: [],
  promptTokens: 0,
  completionTokens: 0,
  message: null,
});

function initialAgents(): Record<AgentNameValue, AgentProgress> {
  return Object.fromEntries(PIPELINE_ORDER.map((agent) => [agent, emptyProgress()])) as Record<
    AgentNameValue,
    AgentProgress
  >;
}

export function useAgentStream() {
  const [agents, setAgents] = useState(initialAgents);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<StreamResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Abort on unmount. Without this, React StrictMode's double effect in
  // development shows up as two concurrent streams writing to the same state.
  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((agent: AgentNameValue, next: Partial<AgentProgress>) => {
    setAgents((current) => ({ ...current, [agent]: { ...current[agent], ...next } }));
  }, []);

  const start = useCallback(
    async (productId: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setAgents(initialAgents());
      setResult(null);
      setError(null);
      setStatus("streaming");

      try {
        await streamEvents<PipelineEvent>({
          // Same origin as every other call. This must never go through a
          // Vercel rewrite: the edge proxy buffers the stream, which turns five
          // visible agent steps into one long pause and a single burst.
          url: `${API_BASE}/products/${productId}/generate-recommendation`,
          signal: controller.signal,
          onEvent(event) {
            switch (event.type) {
              case "agent_started":
                patch(event.agent, { state: "running", startedAt: Date.now() });
                break;

              case "agent_completed":
                patch(event.agent, {
                  state: "done",
                  durationMs: event.durationMs,
                  confidence: event.confidence,
                  output: event.output,
                  toolCalls: event.toolCalls,
                  promptTokens: event.promptTokens,
                  completionTokens: event.completionTokens,
                });
                break;

              case "agent_skipped":
                patch(event.agent, { state: "skipped", message: event.reason });
                break;

              case "agent_failed":
                patch(event.agent, { state: "failed", message: event.error });
                break;

              case "recommendation_ready":
                setResult({
                  recommendationId: event.recommendationId,
                  autoExecuted: event.autoExecuted,
                  blocked: event.blocked ?? false,
                  executionFailed: event.executionFailed ?? false,
                });
                setStatus("done");
                break;

              case "recommendation_failed":
                setError(event.error);
                setStatus("error");
                break;
            }
          },
        });
      } catch (err) {
        // An abort is a deliberate cancellation, not a failure to report.
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "The pipeline could not be reached.");
        setStatus("error");
      }
    },
    [patch],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  const completedCount = PIPELINE_ORDER.filter((agent) =>
    ["done", "skipped", "failed"].includes(agents[agent].state),
  ).length;

  return { agents, status, result, error, start, cancel, completedCount };
}
