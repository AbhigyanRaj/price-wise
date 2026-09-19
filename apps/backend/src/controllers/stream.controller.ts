import type { Request, Response } from "express";
import { orchestrate } from "../agents/orchestrator";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { requireCtx } from "../lib/requireCtx";
import type { PipelineEvent } from "../agents/types";

const KEEPALIVE_MS = 15_000;

export async function generateRecommendation(req: Request, res: Response) {
  const { orgId } = requireCtx(req);
  const { productId } = req.validated?.params as { productId: string };

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    // `no-transform` is the one grounded in spec: Render compresses responses
    // automatically, and a compression encoder buffering small frames is the
    // likely cause of "SSE arrives all at once". X-Accel-Buffering is an nginx
    // convention, harmless but unconfirmed on Render, verify with `curl -N`
    // against the deployed URL.
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  // Comment frames stop an intermediary culling an idle connection during a
  // slow agent, and force a flush.
  const keepAlive = setInterval(() => {
    if (!clientGone) res.write(": keep-alive\n\n");
  }, KEEPALIVE_MS);

  // A disconnect must NOT abort the pipeline. A recommendation that cost five
  // model calls is not discarded because someone closed a tab, it finishes
  // server-side and the client picks it up on the next refetch (FR-GEN-8).
  let clientGone = false;
  req.on("close", () => {
    clientGone = true;
    clearInterval(keepAlive);
  });

  const send = (event: PipelineEvent) => {
    if (clientGone) return;
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    for await (const event of orchestrate(orgId, productId, req.requestId)) {
      send(event);
    }
  } catch (err) {
    logger.error({ requestId: req.requestId, err }, "pipeline error");
    send({
      type: "recommendation_failed",
      error: err instanceof AppError ? err.message : "Pipeline failed",
    });
  } finally {
    clearInterval(keepAlive);
    if (!clientGone) res.end();
  }
}
