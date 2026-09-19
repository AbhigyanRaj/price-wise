import { Router } from "express";
import {
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

export default router;
