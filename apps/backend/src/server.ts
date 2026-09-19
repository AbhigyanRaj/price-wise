import { createApp } from "./app";
import { env } from "./lib/env";
import { logger } from "./lib/logger";

const app = createApp();

// Host is explicit. Render requires the process to bind 0.0.0.0, and relying on
// the runtime default is a portability assumption with a "no open ports
// detected" deploy failure at the end of it.
const server = app.listen(env.PORT, "0.0.0.0", () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "pricewise api listening");
});

// Render sends SIGTERM on deploy. Closing the server lets in-flight requests
// finish instead of being severed mid-response.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
  });
}
