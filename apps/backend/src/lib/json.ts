/** Structural JSON type, so service-layer signatures never need Prisma's types. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const MAX_ARRAY_ENTRIES = 20;
const MAX_STRING_CHARS = 2000;
const MAX_SERIALISED_BYTES = 8_000;

/**
 * Bounds a value before it is persisted on an AgentRun.
 *
 * Tool results are stored so the explainability view can show the evidence
 * behind a claim, not just the question that was asked. But AgentRun rows are
 * kept forever and the size of a result is partly model-influenced: a wide
 * lookback on a busy product returns an unbounded list. An unbounded JSON blob
 * in a column that is read on every detail view is a slow-read problem
 * inherited three weeks later.
 *
 * Truncation is marked rather than silent, so a reader can tell the difference
 * between "there were three competitors" and "we stopped counting".
 */
export function truncateForAudit(value: JsonValue): JsonValue {
  const clipped = clip(value);
  if (JSON.stringify(clipped).length <= MAX_SERIALISED_BYTES) return clipped;
  return { truncated: true, reason: "result exceeded the audit size budget" };
}

function clip(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    return value.length > MAX_STRING_CHARS ? `${value.slice(0, MAX_STRING_CHARS)}...` : value;
  }

  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY_ENTRIES).map(clip);
    return value.length > MAX_ARRAY_ENTRIES
      ? [...head, { truncated: true, omitted: value.length - MAX_ARRAY_ENTRIES }]
      : head;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clip(item)]));
  }

  return value;
}
