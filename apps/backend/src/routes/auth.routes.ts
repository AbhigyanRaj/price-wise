import { Router } from "express";
import { InviteSignupSchema, LoginSchema, SignupSchema } from "@pricewise/shared";
import * as ctrl from "../controllers/auth.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { authRateLimit } from "../middleware/rateLimit";

// Routes declare path and middleware, nothing else (rule R1).
const router = Router();

// authRateLimit is per route, and only on the three that take a password.
//
// It used to sit on the router mount, which put it in front of GET /me as
// well. Two things then combined: its key is `ip:body.email`, and /me has no
// body, so every /me request from an address shared one key with that
// address's failed logins; and a 429 is itself a non-2xx, so
// skipSuccessfulRequests never let the window drain. Ten bad passwords, or one
// office NAT, and every session check 429d for fifteen minutes. The client
// read that as signed out, so the symptom was "refresh the page, get logged
// out". Refresh and logout are excluded for the same reason: neither accepts a
// guessable secret, and both are load-bearing for staying signed in.
router.post("/signup", authRateLimit, validate({ body: SignupSchema }), ctrl.signup);
router.post(
  "/signup/invite",
  authRateLimit,
  validate({ body: InviteSignupSchema }),
  ctrl.signupWithInvite,
);
router.post("/login", authRateLimit, validate({ body: LoginSchema }), ctrl.login);
router.post("/refresh", ctrl.refresh);
router.post("/logout", ctrl.logout);
router.get("/me", requireAuth, ctrl.me);

export default router;
