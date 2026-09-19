import type { NextFunction, Request, Response } from "express";
import type { CategoryRuleInput } from "@pricewise/shared";
import * as categoryRuleService from "../services/categoryRule.service";
import { ok } from "../lib/envelope";
import { requireCtx } from "../lib/requireCtx";

function toDTO(rule: {
  id: string;
  category: string;
  marginFloorPct: number;
  maxDeltaPct: number;
  createdAt: Date;
}) {
  return {
    id: rule.id,
    category: rule.category,
    marginFloorPct: rule.marginFloorPct,
    maxDeltaPct: rule.maxDeltaPct,
    createdAt: rule.createdAt.toISOString(),
  };
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    res.json(ok((await categoryRuleService.listRules(orgId)).map(toDTO)));
  } catch (err) {
    next(err);
  }
}

export async function upsert(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const input = req.validated?.body as CategoryRuleInput;
    res.json(ok(toDTO(await categoryRuleService.upsertRule(orgId, userId, input))));
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const { category } = req.validated?.params as { category: string };
    await categoryRuleService.deleteRule(orgId, userId, category);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
