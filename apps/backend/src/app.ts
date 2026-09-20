import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { requestId } from "./middleware/requestId";
import { csrfGuard } from "./middleware/csrf";
import { generalRateLimit } from "./middleware/rateLimit";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requireAuth } from "./middleware/auth";
import { tenantScope } from "./middleware/tenant";
import authRoutes from "./routes/auth.routes";
import healthRoutes from "./routes/health.routes";
import orgRoutes from "./routes/organization.routes";
import productRoutes from "./routes/product.routes";
import recommendationRoutes from "./routes/recommendation.routes";
import auditRoutes from "./routes/audit.routes";
import mockRoutes from "./routes/mock.routes";

/** Builds the app without binding a port, so integration tests can run it on an
 *  ephemeral port and the production entrypoint can listen on the real one. */
export function createApp() {
  const app = express();

  // Express sits behind a proxy in production (Render). Without this, req.ip is
  // the proxy's address and the auth rate limiter keys every user together.
  app.set("trust proxy", 1);

  // ---- Order is load-bearing ----------------------------------------------
  app.use(requestId); // 1. correlation id first, so everything below can log it
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { requestId: string }).requestId,
      // `enabled` is not a pino-http option, request logging is suppressed by
      // the logger's own level instead (see lib/logger.ts).
      autoLogging: env.NODE_ENV !== "test",
    }),
  ); // 2. logging second, so it captures errors from everything after
  app.use(helmet()); // 3. security headers before any handler can respond
  app.use(
    cors({
      // Exact origin, never a wildcard, credentials mode forbids "*".
      origin: env.CORS_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "X-Pricewise-Client"],
    }),
  ); // 4. before auth: a browser preflight carries no cookies, so rejecting it
  //       at the auth layer would mean the real request is never sent
  app.use(cookieParser()); // 5. parse cookies before auth reads them
  app.use(express.json({ limit: "1mb" })); // 6. bounded body (NFR-S13)
  app.use(csrfGuard); // 7. custom-header check on state-changing verbs
  app.use(generalRateLimit); // 8. broad limit

  app.use(healthRoutes);
  // The brute-force limiter is attached per route inside authRoutes, not here.
  // Mounting it on the router put GET /auth/me behind it, and /auth/me is the
  // session check every page load makes.
  app.use("/auth", authRoutes);
  app.use("/org", requireAuth, tenantScope, orgRoutes);
  app.use("/products", requireAuth, tenantScope, productRoutes);
  app.use("/recommendations", requireAuth, tenantScope, recommendationRoutes);
  app.use("/audit-logs", requireAuth, tenantScope, auditRoutes);
  app.use("/mock", mockRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler); // last: catches everything above

  return app;
}
