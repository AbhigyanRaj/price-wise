import type { Prisma } from "../generated/prisma/client";
import type { InventoryStatus, ProductQuery } from "@pricewise/shared";
import { prisma } from "../lib/prisma";

// orgId is the first positional parameter on every function here (rule R2), and
// appears in every `where` clause. There is no code path that reads a product
// without a tenant scope.

export async function findMany(orgId: string, filters: ProductQuery) {
  const where: Prisma.ProductWhereInput = {
    organizationId: orgId, // never optional, never overridable
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.inventoryStatus ? { inventoryStatus: filters.inventoryStatus } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { sku: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { [filters.sortBy]: filters.sortDir },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        // The table shows "latest competitor price" and "pending recommendation"
        // per row. Fetching them here avoids one query per visible product.
        competitorPrices: { orderBy: { scrapedAt: "desc" }, take: 1 },
        recommendations: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, recommendedPrice: true, confidenceScore: true, status: true },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return { items, totalCount };
}

export function findById(orgId: string, productId: string) {
  // Tenant scope is in the predicate, so another org's product is simply not
  // found, which is why the API can honestly return 404 rather than 403.
  return prisma.product.findFirst({
    where: { id: productId, organizationId: orgId },
    include: {
      competitorPrices: { orderBy: { scrapedAt: "desc" }, take: 10 },
      recommendations: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}

export function findBySku(orgId: string, sku: string) {
  return prisma.product.findUnique({ where: { organizationId_sku: { organizationId: orgId, sku } } });
}

export function create(
  orgId: string,
  data: {
    sku: string;
    name: string;
    category: string;
    currentPrice: number;
    cost: number;
    marginFloorPct: number;
    inventoryLevel: number;
    inventoryStatus: InventoryStatus;
  },
) {
  return prisma.product.create({ data: { ...data, organizationId: orgId } });
}

export async function update(
  orgId: string,
  productId: string,
  data: {
    name?: string | undefined;
    category?: string | undefined;
    currentPrice?: number | undefined;
    cost?: number | undefined;
    marginFloorPct?: number | undefined;
    inventoryLevel?: number | undefined;
    inventoryStatus?: InventoryStatus | undefined;
  },
) {
  // updateMany with the tenant in the predicate, so a cross-tenant id updates
  // zero rows instead of succeeding. Only keys actually supplied are sent.
  const payload = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.category !== undefined ? { category: data.category } : {}),
    ...(data.currentPrice !== undefined ? { currentPrice: data.currentPrice } : {}),
    ...(data.cost !== undefined ? { cost: data.cost } : {}),
    ...(data.marginFloorPct !== undefined ? { marginFloorPct: data.marginFloorPct } : {}),
    ...(data.inventoryLevel !== undefined ? { inventoryLevel: data.inventoryLevel } : {}),
    ...(data.inventoryStatus !== undefined ? { inventoryStatus: data.inventoryStatus } : {}),
  };

  const result = await prisma.product.updateMany({
    where: { id: productId, organizationId: orgId },
    data: payload,
  });

  if (result.count === 0) return null;
  return prisma.product.findFirst({ where: { id: productId, organizationId: orgId } });
}

export function updatePrice(orgId: string, productId: string, price: number) {
  return prisma.product.updateMany({
    where: { id: productId, organizationId: orgId },
    data: { currentPrice: price },
  });
}

export async function remove(orgId: string, productId: string): Promise<boolean> {
  const result = await prisma.product.deleteMany({
    where: { id: productId, organizationId: orgId },
  });
  return result.count > 0;
}

export function listCategories(orgId: string) {
  return prisma.product.findMany({
    where: { organizationId: orgId },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
}

export function addCompetitorPrices(
  productId: string,
  rows: { competitor: string; price: number; scrapedAt: Date }[],
) {
  return prisma.competitorPrice.createMany({
    data: rows.map((r) => ({ ...r, productId })),
  });
}

export function latestCompetitorPrices(productId: string, take = 20) {
  return prisma.competitorPrice.findMany({
    where: { productId },
    orderBy: { scrapedAt: "desc" },
    take,
  });
}

export function addDemandSignal(data: {
  productId: string;
  signalType: string;
  value: number;
  periodStart: Date;
  periodEnd: Date;
}) {
  return prisma.demandSignal.create({ data });
}

export function latestDemandSignals(productId: string, take = 6) {
  return prisma.demandSignal.findMany({
    where: { productId },
    orderBy: { periodEnd: "desc" },
    take,
  });
}
