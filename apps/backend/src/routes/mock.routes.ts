import { Router } from "express";
import { z } from "zod";
import * as mockPlatform from "../services/mockPlatform.service";
import { ok } from "../lib/envelope";
import { validate } from "../middleware/validate";

const router = Router();

const UpdatePriceSchema = z.object({
  sku: z.string().min(1),
  newPrice: z.number().positive(),
});

// Exposed as a route so the mock is visibly an *external* system rather than an
// in-process function call, the execution service talks to it the same way it
// would talk to a real platform. Not called by the frontend.
router.post("/ecommerce/update-price", validate({ body: UpdatePriceSchema }), async (req, res, next) => {
  try {
    const { sku, newPrice } = req.validated?.body as z.infer<typeof UpdatePriceSchema>;
    res.json(ok(await mockPlatform.updatePlatformPrice(sku, newPrice)));
  } catch (err) {
    next(err);
  }
});

export default router;
