import { Router } from "express";
import { pingDatabase } from "../repositories/health.repository";
import { env } from "../lib/env";

const router = Router();

router.get("/healthz", async (_req, res) => {
  const checks = {
    database: await pingDatabase(),
    groq: Boolean(env.GROQ_API_KEY),
  };

  // Groq being unavailable is degraded, not dead: catalog, queue, audit and
  // settings all still work. Only generation is affected (NFR-R1).
  const healthy = checks.database;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks,
    uptime: process.uptime(),
  });
});

export default router;
