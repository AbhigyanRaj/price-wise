import { Router } from "express";
import { z } from "zod";
import { InviteCreateSchema, OrgSettingsPatchSchema } from "@pricewise/shared";
import * as ctrl from "../controllers/organization.controller";
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

export default router;
