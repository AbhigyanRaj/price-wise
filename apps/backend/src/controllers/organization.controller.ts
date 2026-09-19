import type { NextFunction, Request, Response } from "express";
import type { InviteCreate, OrgSettingsPatch } from "@pricewise/shared";
import * as orgService from "../services/organization.service";
import { ok } from "../lib/envelope";
import { toOrgDTO } from "../lib/dto";
import { requireCtx } from "../lib/requireCtx";

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    res.json(ok(toOrgDTO(await orgService.getSettings(orgId))));
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const patch = req.validated?.body as OrgSettingsPatch;
    res.json(ok(toOrgDTO(await orgService.updateSettings(orgId, userId, patch))));
  } catch (err) {
    next(err);
  }
}

export async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    res.json(ok(await orgService.listMembers(orgId)));
  } catch (err) {
    next(err);
  }
}

export async function listInvites(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    res.json(ok(await orgService.listInvites(orgId)));
  } catch (err) {
    next(err);
  }
}

export async function createInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const input = req.validated?.body as InviteCreate;
    const invite = await orgService.createInvite(orgId, userId, input);
    res.status(201).json(
      ok({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        code: invite.code,
        expiresAt: invite.expiresAt.toISOString(),
        usedAt: null,
      }),
    );
  } catch (err) {
    next(err);
  }
}

export async function revokeInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const { inviteId } = req.validated?.params as { inviteId: string };
    await orgService.revokeInvite(orgId, userId, inviteId);
    res.json(ok({ message: "Invite revoked" }));
  } catch (err) {
    next(err);
  }
}
