import type { ZodType } from "zod";
import type { AgentNameValue } from "@pricewise/shared";
import type { JsonValue } from "../lib/json";

/** Everything a tool needs to fetch data, including the tenant scope. A tool
 *  physically cannot read another organization's data because the repository
 *  call underneath requires this orgId. */
export interface ToolContext {
  orgId: string;
  productId: string;
  requestId: string;
}

/**
 * A tool as the loop sees it: argument types erased, validation captured in a
 * closure. Defining tools generically and erasing here keeps each definition
 * type-safe while letting a heterogeneous list live in one array, without
 * casts through `never` or `any`.
 */
export interface RunnableTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  parseArgs: (raw: unknown) => unknown;
  execute: (args: unknown, ctx: ToolContext) => Promise<JsonValue>;
}

export interface ToolDefinition<TArgs = never> {
  name: string;
  /** Part of the engineering, not documentation: this text is what the model
   *  reads to decide whether and how to call the tool. A vague description is
   *  the commonest cause of a wrong call or nonsense arguments. */
  description: string;
  /** JSON Schema, for the model. */
  parameters: Record<string, unknown>;
  /** Zod, for validating what actually comes back. */
  argsSchema: ZodType<TArgs>;
  execute: (args: TArgs, ctx: ToolContext) => Promise<JsonValue>;
}

export function defineTool<TArgs>(def: ToolDefinition<TArgs>): RunnableTool {
  return {
    name: def.name,
    description: def.description,
    parameters: def.parameters,
    parseArgs: (raw) => def.argsSchema.parse(raw),
    execute: (args, ctx) => def.execute(args as TArgs, ctx),
  };
}

export interface ToolCallRecord {
  name: string;
  args: JsonValue;
  durationMs: number;
  failed?: boolean;
}

export interface RunAgentResult<TOut> {
  output: TOut;
  toolCalls: ToolCallRecord[];
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  rounds: number;
  model: string;
}

export interface AgentFailure {
  agent: AgentNameValue;
  error: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  toolCalls: ToolCallRecord[];
}

/** Events the orchestrator yields. The orchestrator knows nothing about HTTP;
 *  the SSE route translates these into frames. */
export type PipelineEvent =
  | { type: "agent_started"; agent: AgentNameValue; startedAt: string }
  | {
      type: "agent_completed";
      agent: AgentNameValue;
      durationMs: number;
      confidence: number | null;
      output: JsonValue;
      toolCalls: ToolCallRecord[];
      promptTokens: number;
      completionTokens: number;
    }
  | { type: "agent_skipped"; agent: AgentNameValue; reason: string }
  | { type: "agent_failed"; agent: AgentNameValue; error: string; willRetry: boolean }
  | {
      type: "recommendation_ready";
      autoExecuted: boolean;
      blocked?: boolean;
      executionFailed?: boolean;
      recommendationId: string;
    }
  | { type: "recommendation_failed"; error: string; failedAgent?: AgentNameValue };
