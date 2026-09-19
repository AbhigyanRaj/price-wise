/**
 * Server-Sent Events parsing, kept as a pure function over strings.
 *
 * The pipeline endpoint is a POST and needs the CSRF header, so `EventSource`
 * is unusable: it can only GET and cannot set headers. That means consuming the
 * stream by hand, and the bug everyone hits is parsing each network chunk as it
 * arrives. A chunk boundary can land anywhere, including the middle of a JSON
 * payload, so `JSON.parse` on a raw chunk throws at random under load.
 *
 * The fix is to accumulate, split on the frame terminator, and keep whatever
 * follows the last complete frame in the buffer for next time. Extracting that
 * as a pure function means it is testable by feeding it deliberately cruel
 * chunk splits, which no DOM-level test would reliably reproduce.
 */

export interface SseFrame {
  /** The `event:` line, when present. */
  event: string | null;
  /** The joined `data:` lines. */
  data: string;
}

export interface FrameParser {
  /** Feeds a chunk and returns every frame that is now complete. */
  push(chunk: string): SseFrame[];
  /** Flushes a trailing frame that arrived without a final blank line. */
  flush(): SseFrame[];
}

export function createFrameParser(): FrameParser {
  let buffer = "";

  function parseFrame(raw: string): SseFrame | null {
    let event: string | null = null;
    const dataLines: string[] = [];

    for (const line of raw.split(/\r?\n/)) {
      // A line beginning with a colon is a comment. The server sends
      // `: keep-alive` every 15 seconds to stop an intermediary culling an
      // idle connection, and it must not be mistaken for data.
      if (line.startsWith(":")) continue;

      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        // Exactly one optional leading space is stripped, per the spec.
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }

    if (dataLines.length === 0) return null;
    return { event, data: dataLines.join("\n") };
  }

  return {
    push(chunk: string): SseFrame[] {
      buffer += chunk;

      // Frames are separated by a blank line. Anything after the last one is
      // incomplete and must wait for more bytes.
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";

      return parts.map(parseFrame).filter((frame): frame is SseFrame => frame !== null);
    },

    flush(): SseFrame[] {
      if (buffer.trim() === "") {
        buffer = "";
        return [];
      }
      const frame = parseFrame(buffer);
      buffer = "";
      return frame ? [frame] : [];
    },
  };
}

export interface StreamOptions<T> {
  url: string;
  signal: AbortSignal;
  onEvent: (event: T) => void;
}

/**
 * Opens a POST stream and dispatches each decoded frame.
 *
 * `TextDecoderStream` rather than decoding each chunk separately: a multi-byte
 * UTF-8 character split across two chunks would otherwise be corrupted, which
 * shows up as mojibake in exactly one agent's notes and nowhere else.
 */
export async function streamEvents<T>({ url, signal, onEvent }: StreamOptions<T>): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      // Describes what we send. The response type is asked for separately.
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Pricewise-Client": "web",
    },
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream failed to open (${response.status})`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = createFrameParser();

  const dispatch = (frames: SseFrame[]) => {
    for (const frame of frames) {
      try {
        onEvent(JSON.parse(frame.data) as T);
      } catch {
        // A frame that is complete but not valid JSON is a server bug. Drop it
        // rather than tearing down a stream that is otherwise working.
      }
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      dispatch(parser.push(value));
    }
    dispatch(parser.flush());
  } finally {
    reader.cancel().catch(() => {
      // Already closed. Nothing useful to do.
    });
  }
}
