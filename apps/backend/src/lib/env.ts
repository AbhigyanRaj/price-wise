import { z } from "zod";

// The only file in the backend permitted to read process.env (rule R6, enforced
// by a lint rule). Validation runs at import time, so a misconfigured deployment
// dies at boot with a named variable rather than failing on first request.

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.url(),
  // An unset variable in a .env file arrives as "" rather than undefined, and
  // an empty string is not a valid URL, so normalise before validating.
  DIRECT_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),

  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "must be at least 32 chars"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // z.stringbool(), NOT z.coerce.boolean(). Coercion is plain Boolean(), so the
  // string "false" becomes true, inverting a security flag. Found in Phase 0.0.
  COOKIE_SECURE: z.stringbool().default(false),
  CORS_ORIGIN: z.url(),

  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL_FAST: z.string().min(1),
  GROQ_MODEL_STRONG: z.string().min(1),

  AGENT_TIMEOUT_MS: z.coerce.number().int().default(30_000),
  AGENT_MAX_RETRIES: z.coerce.number().int().default(2),

  MOCK_PLATFORM_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  MOCK_PLATFORM_LATENCY_MS: z.coerce.number().int().default(400),
});

// COOKIE_DOMAIN is deliberately absent. Phase 0.0 established that *.onrender.com
// is on the Public Suffix List, so browsers reject a cookie Domain attribute
// there. Omitting it makes the cookie host-only, which is what we want.

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:\n");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
