import { Router } from "express";
import {
  BatchApproveSchema,
  ModifySchema,
  RecommendationIdParamSchema,
  RecommendationQuerySchema,
  RejectSchema,
} from "@pricewise/shared";
import * as ctrl from "../controllers/recommendation.controller";
import { validate } from "../middleware/validate";

const router = Router();

// Both roles may resolve a recommendation, that is the analyst's whole job
// (PRD §12.3). Admin-only gates live on configuration, not on the queue.
router.get("/", validate({ query: RecommendationQuerySchema }), ctrl.list);
router.get("/:recommendationId", validate({ params: RecommendationIdParamSchema }), ctrl.detail);

router.post(
  "/:recommendationId/approve",
  validate({ params: RecommendationIdParamSchema }),
  ctrl.approve,
);
router.post(
  "/:recommendationId/reject",
  validate({ params: RecommendationIdParamSchema, body: RejectSchema }),
  ctrl.reject,
);
router.post(
  "/:recommendationId/modify",
  validate({ params: RecommendationIdParamSchema, body: ModifySchema }),
  ctrl.modify,
);

router.post(
  "/:recommendationId/undo",
  validate({ params: RecommendationIdParamSchema }),
  ctrl.undo,
);

// No collision with the parameterised routes above: those are two segments
// deep ("/:recommendationId/approve") and this is one, so Express cannot
// confuse "batch-approve" for an id.
router.post("/batch-approve", validate({ body: BatchApproveSchema }), ctrl.batchApprove);

export default router;
