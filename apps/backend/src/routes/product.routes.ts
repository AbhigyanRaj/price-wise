import { Router } from "express";
import {
  IdParamSchema,
  MarketEventSchema,
  ProductInputSchema,
  ProductPatchSchema,
  ProductQuerySchema,
} from "@pricewise/shared";
import * as ctrl from "../controllers/product.controller";
import { generateRecommendation } from "../controllers/stream.controller";
import { validate } from "../middleware/validate";
import { requireRole } from "../middleware/rbac";

const router = Router();

// Reading is open to any member; writing is admin-only (PRD §12.3).
router.get("/", validate({ query: ProductQuerySchema }), ctrl.list);
router.get("/categories", ctrl.categories);
router.get("/:productId", validate({ params: IdParamSchema }), ctrl.get);

router.post("/", requireRole("ADMIN"), validate({ body: ProductInputSchema }), ctrl.create);
router.patch(
  "/:productId",
  requireRole("ADMIN"),
  validate({ params: IdParamSchema, body: ProductPatchSchema }),
  ctrl.update,
);
router.delete(
  "/:productId",
  requireRole("ADMIN"),
  validate({ params: IdParamSchema }),
  ctrl.remove,
);

// Any member may simulate: it is a demo affordance, not a configuration change.
router.post(
  "/:productId/simulate-market-event",
  validate({ params: IdParamSchema, body: MarketEventSchema }),
  ctrl.simulateMarketEvent,
);

// The only route that invokes the agent pipeline, so agent execution can never
// be triggered without passing the full middleware chain first.
router.post(
  "/:productId/generate-recommendation",
  validate({ params: IdParamSchema }),
  generateRecommendation,
);

export default router;
