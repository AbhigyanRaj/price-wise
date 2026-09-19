import { createHash } from "node:crypto";
import type Groq from "groq-sdk";
import { env } from "../lib/env";

// A full five-agent run is 8–15 API calls. Iterating on downstream code while
// re-issuing identical requests burns the free-tier rate limit for no benefit,
// so outside production identical requests are served from disk.
//
// Keyed on the request, not the product: if the prompt, the model or the tool
// definitions change by one character the hash changes and we call the API. The
// cache therefore cannot serve a stale answer for a changed prompt.
//
// Measured in Phase 0.0: a three-call run went from 2,530ms to 5ms.

const CACHE_DIR = ".cache/groq";

type CreateParams = Parameters<Groq["chat"]["completions"]["create"]>[0] & { stream?: false };
type Completion = Groq.Chat.ChatCompletion;

function cacheKey(params: CreateParams): string {
  const material = JSON.stringify({
    model: params.model,
    messages: params.messages,
    tools: params.tools ?? null,
    temperature: params.temperature ?? null,
    response_format: params.response_format ?? null,
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export interface CachedResult {
  completion: Completion;
  fromCache: boolean;
}

export async function cachedCompletion(groq: Groq, params: CreateParams): Promise<CachedResult> {
  // Never in production, and never in tests, a test that reads a cache written
  // by a previous run is not testing anything.
  if (env.NODE_ENV !== "development") {
    return { completion: (await groq.chat.completions.create(params)) as Completion, fromCache: false };
  }

  const path = `${CACHE_DIR}/${cacheKey(params)}.json`;
  const file = Bun.file(path);

  if (await file.exists()) {
    return { completion: (await file.json()) as Completion, fromCache: true };
  }

  const completion = (await groq.chat.completions.create(params)) as Completion;
  await Bun.write(path, JSON.stringify(completion, null, 2));
  return { completion, fromCache: false };
}
