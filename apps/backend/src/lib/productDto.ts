import { computeMargin } from "../services/product.service";

// Prisma Decimal serialises as a JSON *string*, not a number (verified in Phase
// 0.0). Conversion happens here, at the API boundary, exactly once, rule R7.
interface DecimalLike {
  toString(): string;
}

function money(value: DecimalLike): number {
  return Number(value.toString());
}

interface ProductRow {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  category: string;
  currentPrice: DecimalLike;
  cost: DecimalLike;
  marginFloorPct: number;
  inventoryLevel: number;
  inventoryStatus: string;
  createdAt: Date;
  updatedAt: Date;
  competitorPrices?: { competitor: string; price: DecimalLike; scrapedAt: Date }[];
  recommendations?: {
    id: string;
    recommendedPrice: DecimalLike;
    confidenceScore: number;
    status: string;
  }[];
}

export function toProductDTO(product: ProductRow) {
  const currentPrice = money(product.currentPrice);
  const cost = money(product.cost);
  const latestCompetitor = product.competitorPrices?.[0];
  const pending = product.recommendations?.[0];

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    currentPrice,
    cost,
    marginFloorPct: product.marginFloorPct,
    // Computed server-side so the table cannot show a margin that disagrees
    // with the one the rule engine enforces (FR-EXP-9).
    margin: computeMargin(currentPrice, cost),
    belowFloor: computeMargin(currentPrice, cost) < product.marginFloorPct,
    inventoryLevel: product.inventoryLevel,
    inventoryStatus: product.inventoryStatus,
    latestCompetitorPrice: latestCompetitor
      ? {
          competitor: latestCompetitor.competitor,
          price: money(latestCompetitor.price),
          scrapedAt: latestCompetitor.scrapedAt.toISOString(),
        }
      : null,
    pendingRecommendation: pending
      ? {
          id: pending.id,
          recommendedPrice: money(pending.recommendedPrice),
          confidenceScore: pending.confidenceScore,
          status: pending.status,
        }
      : null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
