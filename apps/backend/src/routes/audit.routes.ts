import { Router } from "express";
import { AuditQuerySchema } from "@pricewise/shared";
import * as ctrl from "../controllers/audit.controller";
import { validate } from "../middleware/validate";

const router = Router();

// Read-only by construction. There is deliberately no PATCH and no DELETE here,
// and no service function that could back one (FR-AUD-3).
router.get("/", validate({ query: AuditQuerySchema }), ctrl.list);
router.get("/actions", ctrl.actions);

export default router;
