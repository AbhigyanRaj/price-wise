import Groq from "groq-sdk";
import { z, type ZodType } from "zod";
import type { AgentNameValue } from "@pricewise/shared";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { AppError } from "../lib/errors";
import type { JsonValue } from "../lib/json";
import { cachedCompletion } from "./cache";
import type { RunAgentResult, RunnableTool, ToolCallRecord, ToolContext } from "./types";

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

/** Thrown when the model's output does not satisfy its schema. The caller gets
 *  exactly one repair attempt, showing the model its own validation error. */
export class SchemaRepairNeeded extends Error {
  constructor(
    readonly agent: AgentNameValue,
    readonly raw: string,
    readonly validationError: string,
  ) {
    super(`${agent} output failed schema validation`);
    this.name = "SchemaRepairNeeded";
  }
}

export interface RunAgentOptions<TOut> {
  agentName: AgentNameValue;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  tools: RunnableTool[];
  outputSchema: ZodType<TOut>;
  ctx: ToolContext;
  maxToolRounds?: number;
}

const DEFAULT_MAX_ROUNDS = 4;

/**
 * The tool loop, written by hand rather than taken from a framework.
 *
 * We send the conversation plus JSON-Schema descriptions of the tools the agent
 * may call. The model replies either with a final answer or with a list of
 * tool_calls. If it asks for tools we execute them ourselves, push the model's
 * own request message followed by one `tool` message per call, matched back by
 * tool_call_id, and call again with the grown conversation. That repeats until
 * the model answers without asking for anything, or a round cap stops it,
 * because a confused model will otherwise request tools forever.
 *
 * The property that matters: the MODEL chooses which tools to call and with
 * what arguments. Nothing is pre-fetched and stuffed into the prompt.
 */
export async function runAgent<TOut>(opts: RunAgentOptions<TOut>): Promise<RunAgentResult<TOut>> {
  const started = Date.now();
  const maxRounds = opts.maxToolRounds ?? DEFAULT_MAX_ROUNDS;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userPrompt },
  ];

  const toolSpecs = opts.tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const toolCalls: ToolCallRecord[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let rounds = 0;

  while (rounds < maxRounds) {
    rounds++;

    const { completion } = await withTimeoutAndRetry(
      () =>
        cachedCompletion(groq, {
          model: opts.model,
          messages,
          ...(toolSpecs.length > 0 ? { tools: toolSpecs, tool_choice: "auto" as const } : {}),
          // Low: this is analysis, not prose. Run-to-run variance is a defect.
          temperature: 0.2,
          // Force JSON on the final round, when there is no further chance to
          // ask for tools and the model must simply answer.
          ...(rounds === maxRounds || toolSpecs.length === 0
            ? { response_format: { type: "json_object" as const } }
            : {}),
        }),
      opts.agentName,
    );

    promptTokens += completion.usage?.prompt_tokens ?? 0;
    completionTokens += completion.usage?.completion_tokens ?? 0;

    const choice = completion.choices[0];
    if (!choice?.message) throw new AppError("LLM_UNAVAILABLE", "Empty completion from model");

    const requested = choice.message.tool_calls ?? [];

    // No tools requested: the model is answering.
    if (requested.length === 0) {
      return {
        output: parseAgentOutput(choice.message.content, opts.outputSchema, opts.agentName),
        toolCalls,
        promptTokens,
        completionTokens,
        durationMs: Date.now() - started,
        rounds,
        model: opts.model,
      };
    }

    // The model's request must go into the history before the results, or the
    // tool messages have nothing to attach to.
    messages.push(choice.message);

    // Tools within one round are independent, so run them concurrently.
    const results = await Promise.all(
      requested.map(async (call) => {
        const tool = opts.tools.find((t) => t.name === call.function.name);
        const t0 = Date.now();

        if (!tool) {
          return {
            id: call.id,
            content: JSON.stringify({ error: `Unknown tool: ${call.function.name}`, available: false }),
          };
        }

        try {
          const rawArgs: unknown = JSON.parse(call.function.arguments || "{}");
          const args = tool.parseArgs(rawArgs);
          const result = await tool.execute(args, opts.ctx);
          toolCalls.push({
            name: tool.name,
            args: args as JsonValue,
            durationMs: Date.now() - t0,
          });
          return { id: call.id, content: JSON.stringify(result) };
        } catch (err) {
          // A failed tool is handed back to the model as DATA, not thrown. The
          // model can then reason about the gap, "competitor data unavailable,
          // confidence reduced", instead of the whole pipeline dying because
          // one source was down.
          logger.warn(
            { agent: opts.agentName, tool: call.function.name, err },
            "tool call failed",
          );
          toolCalls.push({ name: tool.name, args: null, durationMs: Date.now() - t0, failed: true });
          return {
            id: call.id,
            content: JSON.stringify({ error: String(err), available: false }),
          };
        }
      }),
    );

    for (const r of results) {
      messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
    }
  }

  throw new AppError("AGENT_TIMEOUT", `${opts.agentName} exceeded ${maxRounds} tool rounds`);
}

/** Runs an agent, and on a schema failure retries ONCE with the validation
 *  error appended, a model that returned a nearly-right object usually fixes
 *  it when shown exactly what was wrong. A second failure fails the agent. */
export async function runAgentWithRepair<TOut>(opts: RunAgentOptions<TOut>): Promise<RunAgentResult<TOut>> {
  try {
    return await runAgent(opts);
  } catch (err) {
    if (!(err instanceof SchemaRepairNeeded)) throw err;

    logger.warn({ agent: opts.agentName }, "schema repair attempt");

    return runAgent({
      ...opts,
      userPrompt:
        `${opts.userPrompt}\n\n` +
        `YOUR PREVIOUS RESPONSE WAS REJECTED. It did not satisfy the required schema:\n` +
        `${err.validationError}\n\n` +
        `Respond again with a single valid JSON object. Do not explain the error.`,
    });
  }
}

function parseAgentOutput<T>(content: string | null, schema: ZodType<T>, agent: AgentNameValue): T {
  if (!content) throw new AppError("LLM_UNAVAILABLE", `${agent} returned no content`);

  // Models occasionally wrap JSON in a markdown fence despite the instruction.
  // Observed in Phase 0.0: gpt-oss-20b does not, but this costs nothing and the
  // stronger model has not been characterised.
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    const extracted = extractFirstJsonObject(cleaned);
    if (extracted === null) {
      throw new AppError("LLM_UNAVAILABLE", `${agent} returned unparseable output`);
    }
    raw = extracted;
  }

  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  throw new SchemaRepairNeeded(agent, cleaned, z.prettifyError(result.error));
}

/** Last resort: pull the outermost brace-balanced object out of prose. */
function extractFirstJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;

    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

async function withTimeoutAndRetry<T>(fn: () => Promise<T>, agent: AgentNameValue): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= env.AGENT_MAX_RETRIES; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new AppError("AGENT_TIMEOUT", `${agent} timed out`)),
            env.AGENT_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === env.AGENT_MAX_RETRIES) break;

      // 1s, 4s, plus jitter so parallel agents do not retry in lockstep and
      // re-trigger the same rate limit together.
      const delay = 1000 * Math.pow(4, attempt) + Math.random() * 500;
      logger.warn({ agent, attempt, delay }, "retrying agent call");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastErr instanceof AppError
    ? lastErr
    : new AppError("LLM_UNAVAILABLE", String(lastErr));
}

function isRetryable(err: unknown): boolean {
  if (err instanceof AppError) return err.code === "AGENT_TIMEOUT";
  const status = (err as { status?: number })?.status;
  return status === 429 || (typeof status === "number" && status >= 500);
}
