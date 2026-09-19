import { describe, expect, test } from "vitest";
import { createFrameParser } from "./sse";

/**
 * The parser is fed deliberately cruel chunk splits, because the real network
 * produces them and a DOM-level test would not reproduce them reliably. Every
 * case below is a shape the pipeline endpoint actually emits.
 */

const AGENT_STARTED =
  'event: agent_started\ndata: {"type":"agent_started","agent":"MARKET_INTELLIGENCE","startedAt":"2026-09-19T12:00:00.000Z"}\n\n';

const AGENT_DONE =
  'event: agent_completed\ndata: {"type":"agent_completed","agent":"MARKET_INTELLIGENCE","durationMs":1672,"confidence":0.7}\n\n';

describe("createFrameParser", () => {
  test("parses a whole frame delivered in one chunk", () => {
    const parser = createFrameParser();
    const frames = parser.push(AGENT_STARTED);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.event).toBe("agent_started");
    expect(JSON.parse(frames[0]?.data ?? "{}")).toMatchObject({
      agent: "MARKET_INTELLIGENCE",
    });
  });

  test("parses several frames arriving together", () => {
    const parser = createFrameParser();
    expect(parser.push(AGENT_STARTED + AGENT_DONE)).toHaveLength(2);
  });

  test("holds an incomplete frame until the rest arrives", () => {
    const parser = createFrameParser();
    expect(parser.push("event: agent_started\ndata: {\"type\":\"age")).toHaveLength(0);
    const frames = parser.push('nt_started","agent":"INVENTORY_COST"}\n\n');

    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0]?.data ?? "{}")).toMatchObject({ agent: "INVENTORY_COST" });
  });

  test("survives a split at every single byte position", () => {
    // The regression guard. Parsing a raw chunk rather than buffering to the
    // frame terminator fails somewhere in this loop, every time.
    const payload = AGENT_STARTED + AGENT_DONE;

    for (let cut = 1; cut < payload.length; cut++) {
      const parser = createFrameParser();
      const collected = [
        ...parser.push(payload.slice(0, cut)),
        ...parser.push(payload.slice(cut)),
      ];

      expect(collected).toHaveLength(2);
      // And each one is still valid JSON, which is the property that matters.
      for (const frame of collected) {
        expect(() => JSON.parse(frame.data)).not.toThrow();
      }
    }
  });

  test("survives byte-at-a-time delivery", () => {
    const parser = createFrameParser();
    const collected = [...AGENT_STARTED].flatMap((char) => parser.push(char));
    expect(collected).toHaveLength(1);
  });

  test("ignores keep-alive comment frames", () => {
    const parser = createFrameParser();
    // The server sends these every 15 seconds so an intermediary does not cull
    // an idle connection while an agent is thinking.
    expect(parser.push(": keep-alive\n\n")).toHaveLength(0);
    expect(parser.push(`: keep-alive\n\n${AGENT_DONE}`)).toHaveLength(1);
  });

  test("handles CRLF line endings", () => {
    const parser = createFrameParser();
    const frames = parser.push('event: ping\r\ndata: {"ok":true}\r\n\r\n');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toBe('{"ok":true}');
  });

  test("joins multi-line data fields", () => {
    const parser = createFrameParser();
    const frames = parser.push("data: line one\ndata: line two\n\n");
    expect(frames[0]?.data).toBe("line one\nline two");
  });

  test("strips exactly one leading space after the colon", () => {
    const parser = createFrameParser();
    // Two spaces means the payload genuinely starts with one.
    expect(parser.push("data:  padded\n\n")[0]?.data).toBe(" padded");
  });

  test("a frame with no data line yields nothing", () => {
    const parser = createFrameParser();
    expect(parser.push("event: heartbeat\n\n")).toHaveLength(0);
  });

  test("flush emits a trailing frame that never got its blank line", () => {
    const parser = createFrameParser();
    expect(parser.push('data: {"type":"recommendation_ready"}')).toHaveLength(0);

    const flushed = parser.flush();
    expect(flushed).toHaveLength(1);
    expect(JSON.parse(flushed[0]?.data ?? "{}")).toMatchObject({
      type: "recommendation_ready",
    });
  });

  test("flush on an empty buffer yields nothing and is safe to call twice", () => {
    const parser = createFrameParser();
    parser.push(AGENT_DONE);
    expect(parser.flush()).toHaveLength(0);
    expect(parser.flush()).toHaveLength(0);
  });

  test("a JSON payload containing a blank line inside a string is not split", () => {
    // Rationale text is agent-written prose and can contain anything. The
    // terminator only appears between frames because the server escapes
    // newlines inside JSON strings, and this asserts we rely on that.
    const parser = createFrameParser();
    const frames = parser.push('data: {"notes":"first\\n\\nsecond"}\n\n');

    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0]?.data ?? "{}").notes).toBe("first\n\nsecond");
  });
});
