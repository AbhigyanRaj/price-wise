import type { NextFunction, Request, Response } from "express";
import type { InviteSignupInput, LoginInput, SignupInput } from "@pricewise/shared";
import * as authService from "../services/auth.service";
import * as orgService from "../services/organization.service";
import { clearAuthCookies, setAuthCookies } from "../lib/cookies";
import { ok } from "../lib/envelope";
import { toOrgDTO, toUserDTO } from "../lib/dto";
import { AppError } from "../lib/errors";
import { requireCtx } from "../lib/requireCtx";
import * as userRepo from "../repositories/user.repository";

// Controllers translate HTTP into one service call and shape the envelope.
// No business `if` statements, no Prisma (rule R1).

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.validated?.body as SignupInput;
    const { user, organization, tokens } = await authService.signup(input, req.ip);
    setAuthCookies(res, tokens.access, tokens.refresh);
    res.status(201).json(ok({ user: toUserDTO(user), organization: toOrgDTO(organization) }));
  } catch (err) {
    next(err);
  }
}

export async function signupWithInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.validated?.body as InviteSignupInput;
    const { user, organization } = await orgService.redeemInvite(input);
    // Joining logs the user straight in, an invite already proved identity.
    const tokens = await authService.issueTokensFor(user);
    setAuthCookies(res, tokens.access, tokens.refresh);
    res.status(201).json(ok({ user: toUserDTO(user), organization: toOrgDTO(organization) }));
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const input = req.validated?.body as LoginInput;
    const { user, organization, tokens } = await authService.login(input);
    setAuthCookies(res, tokens.access, tokens.refresh);
    res.json(ok({ user: toUserDTO(user), organization: toOrgDTO(organization) }));
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const presented = req.cookies?.refresh_token as string | undefined;
    if (!presented) throw new AppError("REFRESH_INVALID", "No session to refresh");

    const { user, organization, tokens } = await authService.refresh(presented);
    setAuthCookies(res, tokens.access, tokens.refresh);
    res.json(ok({ user: toUserDTO(user), organization: toOrgDTO(organization) }));
  } catch (err) {
    // A failed refresh must clear the cookies, or the client retries forever
    // with a token that can never work.
    clearAuthCookies(res);
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logout(req.cookies?.refresh_token as string | undefined);
    clearAuthCookies(res);
    res.json(ok({ message: "Logged out" }));
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = requireCtx(req);
    const user = await userRepo.findByIdWithOrg(userId);
    if (!user) throw new AppError("UNAUTHENTICATED", "Session invalid");

    res.json(ok({ user: toUserDTO(user), organization: toOrgDTO(user.organization) }));
  } catch (err) {
    next(err);
  }
}
