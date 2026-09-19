import pino from "pino";
import { env } from "./env";

// Structured JSON logs. Every request carries a requestId so a user-reported
// failure can be found in the logs immediately (rule R8).
export const logger = pino({
  // Silent under test: a passing suite should print assertions, not traffic.
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  // Never log a password, token, cookie or full LLM prompt containing customer
  // data. Redaction is centralised here rather than trusted to call sites.
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "password",
      "passwordHash",
      "*.password",
      "*.passwordHash",
      "token",
      "accessToken",
      "refreshToken",
    ],
    censor: "[redacted]",
  },
  ...(env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});
