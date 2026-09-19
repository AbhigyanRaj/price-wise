import { Router } from "express";
import { z } from "zod";
import {
  CategoryParamSchema,
  CategoryRuleSchema,
  InviteCreateSchema,
  OrgSettingsPatchSchema,
} from "@pricewise/shared";
import * as ctrl from "../controllers/organization.controller";
import * as ruleCtrl from "../controllers/categoryRule.controller";
import { validate } from "../middleware/validate";
import { requireRole } from "../middleware/rbac";

const router = Router();

const InviteIdParam = z.object({ inviteId: z.uuid() });

// Any member may read their own organization's settings, the analyst UI shows
// the confidence threshold. Only an admin may change it.
router.get("/settings", ctrl.getSettings);
router.patch(
  "/settings",
  requireRole("ADMIN"),
  validate({ body: OrgSettingsPatchSchema }),
  ctrl.updateSettings,
);

router.get("/members", requireRole("ADMIN"), ctrl.listMembers);

router.get("/invites", requireRole("ADMIN"), ctrl.listInvites);
router.post(
  "/invites",
  requireRole("ADMIN"),
  validate({ body: InviteCreateSchema }),
  ctrl.createInvite,
);
router.delete(
  "/invites/:inviteId",
  requireRole("ADMIN"),
  validate({ params: InviteIdParam }),
  ctrl.revokeInvite,
);

// Any member may read the rules: they explain why a recommendation was
// bounded, which an analyst needs. Only an admin may change them.
router.get("/category-rules", ruleCtrl.list);

// PUT, not POST: the operation underneath is an idempotent upsert keyed on
// (organizationId, category), and the verb should say so.
router.put(
  "/category-rules",
  requireRole("ADMIN"),
  validate({ body: CategoryRuleSchema }),
  ruleCtrl.upsert,
);
router.delete(
  "/category-rules/:category",
  requireRole("ADMIN"),
  validate({ params: CategoryParamSchema }),
  ruleCtrl.remove,
);

export default router;
