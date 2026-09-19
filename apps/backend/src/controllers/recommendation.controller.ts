import type { NextFunction, Request, Response } from "express";
import type { RecommendationQuery } from "@pricewise/shared";
import * as recService from "../services/recommendation.service";
import { ok, okPaged } from "../lib/envelope";
import { toAgentRunDTO, toExecutionDTO, toRecommendationDTO } from "../lib/recommendationDto";
import { requireCtx } from "../lib/requireCtx";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    const q = req.validated?.query as RecommendationQuery;
    const { items, nextCursor, hasMore } = await recService.listRecommendations(orgId, q);
    res.json(okPaged(items.map(toRecommendationDTO), { nextCursor, hasMore }));
  } catch (err) {
    next(err);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    const { recommendationId } = req.validated?.params as { recommendationId: string };
    const rec = await recService.getRecommendationDetail(orgId, recommendationId);

    res.json(
      ok({
        ...toRecommendationDTO(rec),
        agentRuns: rec.agentRuns.map(toAgentRunDTO),
        executions: rec.executions.map(toExecutionDTO),
        comparable: rec.comparable.map((c) => ({
          id: c.id,
          recommendedPrice: Number(c.recommendedPrice.toString()),
          modifiedPrice: c.modifiedPrice ? Number(c.modifiedPrice.toString()) : null,
          confidenceScore: c.confidenceScore,
          status: c.status,
          rejectionReason: c.rejectionReason,
          createdAt: c.createdAt.toISOString(),
        })),
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const { recommendationId } = req.validated?.params as { recommendationId: string };
    const updated = await recService.approve(orgId, userId, recommendationId);
    res.json(ok(toRecommendationDTO(updated)));
  } catch (err) {
    next(err);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const { recommendationId } = req.validated?.params as { recommendationId: string };
    const { reason } = req.validated?.body as { reason: string };
    const updated = await recService.reject(orgId, userId, recommendationId, reason);
    res.json(ok(toRecommendationDTO(updated)));
  } catch (err) {
    next(err);
  }
}

export async function modify(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const { recommendationId } = req.validated?.params as { recommendationId: string };
    const { modifiedPrice } = req.validated?.body as { modifiedPrice: number };
    const updated = await recService.modify(orgId, userId, recommendationId, modifiedPrice);
    res.json(ok(toRecommendationDTO(updated)));
  } catch (err) {
    next(err);
  }
}

export async function undo(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const { recommendationId } = req.validated?.params as { recommendationId: string };
    const restored = await recService.undo(orgId, userId, recommendationId);
    res.json(ok(toRecommendationDTO(restored)));
  } catch (err) {
    next(err);
  }
}

export async function batchApprove(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const { ids } = req.validated?.body as { ids: string[] };
    // Per-item results, not a throw on first failure: eight of ten succeeding
    // is a different outcome from the whole thing failing, and the client has
    // to be able to tell them apart.
    res.json(ok(await recService.approveMany(orgId, userId, ids)));
  } catch (err) {
    next(err);
  }
}
