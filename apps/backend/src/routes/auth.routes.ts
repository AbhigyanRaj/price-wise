import { Router } from "express";
import { InviteSignupSchema, LoginSchema, SignupSchema } from "@pricewise/shared";
import * as ctrl from "../controllers/auth.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";

// Routes declare path and middleware, nothing else (rule R1).
const router = Router();

router.post("/signup", validate({ body: SignupSchema }), ctrl.signup);
router.post("/signup/invite", validate({ body: InviteSignupSchema }), ctrl.signupWithInvite);
router.post("/login", validate({ body: LoginSchema }), ctrl.login);
router.post("/refresh", ctrl.refresh);
router.post("/logout", ctrl.logout);
router.get("/me", requireAuth, ctrl.me);

export default router;
