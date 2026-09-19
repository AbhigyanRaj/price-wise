import { beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";

// Groq is mocked at the cache boundary, every API call in the loop goes
// through cachedCompletion, so scripting it here exercises the real loop with
// zero network traffic. No test in this suite may make a live call: flaky and
// expensive CI destroys the value of the whole suite (CLAUDE.md §6).

let scripted: MockResponse[] = [];
let callCount = 0;
let lastRequest: { messages: unknown[]; tools?: unknown } | null = null;

type MockResponse =
  | { kind: "text"; content: string }
  | { kind: "tools"; calls: { id: string; name: string; args: string }[] }
  | { kind: "error"; error: unknown };

// Errors are thrown before reaching here, so the builder only ever sees the
// two response-shaped variants.
function buildCompletion(r: Exclude<MockResponse, { kind: "error" }>) {
  if (r.kind === "text") {
    return {
      choices: [{ message: { role: "assistant", content: r.content, tool_calls: undefined } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    };
  }
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: r.calls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: c.args },
          })),
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

mock.module("../../src/agents/cache", () => ({
  cachedCompletion: async (_groq: unknown, params: { messages: unknown[]; tools?: unknown }) => {
    lastRequest = params;
    const r = scripted[callCount++];
    if (!r) throw new Error("mockGroq: ran out of scripted responses");
    if (r.kind === "error") throw r.error;
    return { completion: buildCompletion(r), fromCache: false };
  },
}));

const { runAgent, runAgentWithRepair, SchemaRepairNeeded } = await import("../../src/agents/groqClient");
const { defineTool } = await import("../../src/agents/types");

const OutputSchema = z.object({ answer: z.string(), confidence: z.number().min(0).max(1) });

const toolCallLog: { name: string; args: unknown }[] = [];

const fastTool = defineTool({
  name: "get_competitor_prices",
  source: { label: "CompetitorPrice table, synthetic scrape feed", kind: "internal_db" as const },
  description: "test tool",
  parameters: { type: "object", properties: { lookbackDays: { type: "number" } }, required: ["lookbackDays"] },
  argsSchema: z.object({ lookbackDays: z.number() }),
  async execute(args) {
    toolCallLog.push({ name: "get_competitor_prices", args });
    return { available: true, median: 289.99 };
  },
});

const slowTool = defineTool({
  name: "get_price_history",
  source: { label: "CompetitorPrice table, bucketed weekly", kind: "internal_db" as const },
  description: "test tool",
  parameters: { type: "object", properties: {}, required: [] },
  argsSchema: z.object({}),
  async execute(args) {
    await new Promise((r) => setTimeout(r, 30));
    toolCallLog.push({ name: "get_price_history", args });
    return { available: true, series: [] };
  },
});

const throwingTool = defineTool({
  name: "broken_tool",
  source: { label: "A source that is down", kind: "internal_db" as const },
  description: "always fails",
  parameters: { type: "object", properties: {}, required: [] },
  argsSchema: z.object({}),
  async execute() {
    throw new Error("upstream data source is down");
  },
});

function opts(tools: ReturnType<typeof defineTool>[] = [fastTool]) {
  return {
    agentName: "MARKET_INTELLIGENCE" as const,
    model: "test-model",
    systemPrompt: "system",
    userPrompt: "user",
    tools,
    outputSchema: OutputSchema,
    ctx: { orgId: "org-1", productId: "prod-1", requestId: "req-1" },
  };
}

beforeEach(() => {
  scripted = [];
  callCount = 0;
  toolCallLog.length = 0;
  lastRequest = null;
});

describe("the tool loop", () => {
  test("returns parsed output when the model answers without tools", async () => {
    scripted = [{ kind: "text", content: '{"answer":"done","confidence":0.9}' }];

    const result = await runAgent(opts());

    expect(result.output.answer).toBe("done");
    expect(result.toolCalls).toHaveLength(0);
    expect(result.rounds).toBe(1);
    expect(result.promptTokens).toBe(100);
  });

  test("executes a requested tool, then continues to the answer", async () => {
    scripted = [
      { kind: "tools", calls: [{ id: "c1", name: "get_competitor_prices", args: '{"lookbackDays":7}' }] },
      { kind: "text", content: '{"answer":"used the tool","confidence":0.8}' },
    ];

    const result = await runAgent(opts());

    expect(toolCallLog).toHaveLength(1);
    expect(toolCallLog[0]?.args).toEqual({ lookbackDays: 7 });
    expect(result.rounds).toBe(2);
    // Tokens accumulate across rounds, not just the last one.
    expect(result.promptTokens).toBe(200);
    // The recorded arguments are what the explainability UI renders.
    expect(result.toolCalls[0]?.args).toEqual({ lookbackDays: 7 });
  });

  test("runs multiple tools in one round concurrently", async () => {
    scripted = [
      {
        kind: "tools",
        calls: [
          { id: "c1", name: "get_price_history", args: "{}" },
          { id: "c2", name: "get_price_history", args: "{}" },
        ],
      },
      { kind: "text", content: '{"answer":"both","confidence":0.8}' },
    ];

    const started = Date.now();
    await runAgent(opts([slowTool]));
    const elapsed = Date.now() - started;

    expect(toolCallLog).toHaveLength(2);
    // Two 30ms tools run together take ~30ms, not ~60ms. Sequential execution
    // would double the latency of every multi-tool round.
    expect(elapsed).toBeLessThan(55);
  });

  test("appends one tool message per call, matched by tool_call_id", async () => {
    scripted = [
      { kind: "tools", calls: [{ id: "call-abc", name: "get_competitor_prices", args: '{"lookbackDays":7}' }] },
      { kind: "text", content: '{"answer":"ok","confidence":0.8}' },
    ];

    await runAgent(opts());

    const messages = (lastRequest?.messages ?? []) as { role: string; tool_call_id?: string }[];
    const toolMessage = messages.find((m) => m.role === "tool");
    expect(toolMessage?.tool_call_id).toBe("call-abc");
  });

  test("a failing tool is reported to the model as data, not thrown", async () => {
    scripted = [
      { kind: "tools", calls: [{ id: "c1", name: "broken_tool", args: "{}" }] },
      { kind: "text", content: '{"answer":"degraded","confidence":0.3}' },
    ];

    const result = await runAgent(opts([throwingTool]));

    // The pipeline survives one dead data source.
    expect(result.output.answer).toBe("degraded");
    const messages = (lastRequest?.messages ?? []) as { role: string; content?: string }[];
    const toolMessage = messages.find((m) => m.role === "tool");
    expect(toolMessage?.content).toContain("available");
    expect(result.toolCalls[0]?.failed).toBe(true);
  });

  test("an unknown tool name is reported back rather than crashing", async () => {
    scripted = [
      { kind: "tools", calls: [{ id: "c1", name: "no_such_tool", args: "{}" }] },
      { kind: "text", content: '{"answer":"recovered","confidence":0.5}' },
    ];

    const result = await runAgent(opts());
    expect(result.output.answer).toBe("recovered");
  });

  test("malformed tool arguments surface to the model as an error", async () => {
    scripted = [
      { kind: "tools", calls: [{ id: "c1", name: "get_competitor_prices", args: '{"lookbackDays":"seven"}' }] },
      { kind: "text", content: '{"answer":"recovered","confidence":0.5}' },
    ];

    const result = await runAgent(opts());
    expect(toolCallLog).toHaveLength(0); // never executed with bad args
    expect(result.output.answer).toBe("recovered");
  });

  test("exceeding the round cap fails rather than looping forever", async () => {
    // A model that asks for tools indefinitely.
    scripted = Array.from({ length: 6 }, () => ({
      kind: "tools" as const,
      calls: [{ id: "c", name: "get_competitor_prices", args: '{"lookbackDays":7}' }],
    }));

    await expect(runAgent(opts())).rejects.toThrow(/exceeded .* tool rounds/);
  });
});

describe("output parsing", () => {
  test("strips a markdown fence", async () => {
    scripted = [{ kind: "text", content: '```json\n{"answer":"fenced","confidence":0.7}\n```' }];
    const result = await runAgent(opts());
    expect(result.output.answer).toBe("fenced");
  });

  test("extracts the object when the model adds prose around it", async () => {
    scripted = [
      { kind: "text", content: 'Here is my analysis:\n{"answer":"prosed","confidence":0.7}\nHope that helps.' },
    ];
    const result = await runAgent(opts());
    expect(result.output.answer).toBe("prosed");
  });

  test("handles braces inside string values without truncating", async () => {
    scripted = [{ kind: "text", content: '{"answer":"a } brace","confidence":0.7}' }];
    const result = await runAgent(opts());
    expect(result.output.answer).toBe("a } brace");
  });

  test("schema-invalid output raises SchemaRepairNeeded, not a crash", async () => {
    scripted = [{ kind: "text", content: '{"answer":"x","confidence":5}' }];
    await expect(runAgent(opts())).rejects.toBeInstanceOf(SchemaRepairNeeded);
  });
});

describe("schema repair", () => {
  test("retries once, showing the model its own validation error", async () => {
    scripted = [
      { kind: "text", content: '{"answer":"x","confidence":5}' },
      { kind: "text", content: '{"answer":"fixed","confidence":0.9}' },
    ];

    const result = await runAgentWithRepair(opts());

    expect(result.output.answer).toBe("fixed");
    const messages = (lastRequest?.messages ?? []) as { role: string; content?: string }[];
    const userMessage = messages.find((m) => m.role === "user");
    expect(userMessage?.content).toContain("REJECTED");
    expect(userMessage?.content).toContain("confidence");
  });

  test("a second schema failure fails the agent", async () => {
    scripted = [
      { kind: "text", content: '{"answer":"x","confidence":5}' },
      { kind: "text", content: '{"answer":"x","confidence":9}' },
    ];

    await expect(runAgentWithRepair(opts())).rejects.toBeInstanceOf(SchemaRepairNeeded);
  });
});

describe("retry and timeout", () => {
  test("retries a 429 and then succeeds", async () => {
    scripted = [
      { kind: "error", error: Object.assign(new Error("rate limited"), { status: 429 }) },
      { kind: "text", content: '{"answer":"after retry","confidence":0.8}' },
    ];

    const result = await runAgent(opts());
    expect(result.output.answer).toBe("after retry");
    expect(callCount).toBe(2);
  }, 15_000);

  test("a non-retryable error fails immediately without burning retries", async () => {
    scripted = [{ kind: "error", error: Object.assign(new Error("bad request"), { status: 400 }) }];

    await expect(runAgent(opts())).rejects.toThrow();
    expect(callCount).toBe(1);
  });
});

describe("tool provenance is recorded", () => {
  test("a successful call records what came back and where it came from", async () => {
    // The loop calls the model, gets a tool request, runs the tool, then calls
    // the model again with the result. Two scripted responses, not one.
    scripted = [
      {
        kind: "tools",
        calls: [
          { id: "c1", name: "get_competitor_prices", args: '{"lookbackDays":7}' },
        ],
      },
      { kind: "text", content: '{"answer":"done","confidence":0.9}' },
    ];

    const result = await runAgent(opts([fastTool]));

    const call = result.toolCalls.find((c) => c.name === "get_competitor_prices");
    expect(call).toBeDefined();
    // The assignment asks the interface to show which source backed a claim.
    // That is only possible if the source travels with the call.
    expect(call?.source?.label).toBe("CompetitorPrice table, synthetic scrape feed");
    expect(call?.result).toEqual({ available: true, median: 289.99 });
    expect(call?.failed).toBeUndefined();
  });

  test("a failed call records the reason rather than vanishing", async () => {
    scripted = [
      { kind: "tools", calls: [{ id: "c1", name: "broken_tool", args: "{}" }] },
      { kind: "text", content: '{"answer":"degraded","confidence":0.4}' },
    ];

    const result = await runAgent(opts([throwingTool]));

    const call = result.toolCalls.find((c) => c.name === "broken_tool");
    expect(call?.failed).toBe(true);
    // "No data in that window" and "the tool threw" are different situations
    // and used to look identical downstream.
    expect(JSON.stringify(call?.result)).toContain("upstream data source is down");
    expect(call?.source?.label).toBe("A source that is down");
  });
});
