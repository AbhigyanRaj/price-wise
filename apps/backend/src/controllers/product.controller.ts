import type { NextFunction, Request, Response } from "express";
import type { MarketEvent, ProductInput, ProductPatch, ProductQuery } from "@pricewise/shared";
import * as productService from "../services/product.service";
import * as marketEventService from "../services/marketEvent.service";
import { ok, okPaged, offsetPagination } from "../lib/envelope";
import { toProductDTO } from "../lib/productDto";
import { requireCtx } from "../lib/requireCtx";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    const filters = req.validated?.query as ProductQuery;
    const { items, totalCount } = await productService.listProducts(orgId, filters);

    res.json(
      okPaged(
        items.map(toProductDTO),
        offsetPagination(filters.page, filters.pageSize, totalCount),
      ),
    );
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    const { productId } = req.validated?.params as { productId: string };
    res.json(ok(toProductDTO(await productService.getProduct(orgId, productId))));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const input = req.validated?.body as ProductInput;
    const product = await productService.createProduct(orgId, userId, input);
    res.status(201).json(ok(toProductDTO(product)));
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const { productId } = req.validated?.params as { productId: string };
    const patch = req.validated?.body as ProductPatch;
    const product = await productService.updateProduct(orgId, userId, productId, patch);
    res.json(ok(toProductDTO(product)));
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const { productId } = req.validated?.params as { productId: string };
    await productService.deleteProduct(orgId, userId, productId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function categories(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = requireCtx(req);
    res.json(ok(await productService.listCategories(orgId)));
  } catch (err) {
    next(err);
  }
}

export async function simulateMarketEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = requireCtx(req);
    const { productId } = req.validated?.params as { productId: string };
    const event = req.validated?.body as MarketEvent;
    res.json(ok(await marketEventService.simulate(orgId, userId, productId, event)));
  } catch (err) {
    next(err);
  }
}
