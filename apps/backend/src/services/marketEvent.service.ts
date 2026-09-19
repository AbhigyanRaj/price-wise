import type { MarketEvent } from "@pricewise/shared";
import { notFound } from "../lib/errors";
import * as productRepo from "../repositories/product.repository";
import * as auditService from "./audit.service";

// A demo control, and an honest one: rather than waiting for the synthetic
// market to drift, an evaluator can cause a specific condition and watch the
// pipeline respond to it. It writes real rows, the agents cannot tell the
// difference between this and generated history.

const NEW_ENTRANT_NAME = "Upstart Direct";

export async function simulate(
  orgId: string,
  actorId: string,
  productId: string,
  event: MarketEvent,
) {
  const product = await productRepo.findById(orgId, productId);
  if (!product) throw notFound("Product");

  const currentPrice = Number(product.currentPrice);
  const now = new Date();
  // Default magnitudes chosen to be clearly visible without being absurd.
  const magnitude = event.magnitudePct ?? defaultMagnitude(event.eventType);

  let summary: string;

  switch (event.eventType) {
    case "competitor_price_drop":
    case "competitor_price_increase": {
      const factor = 1 + magnitude / 100;
      const existing = await productRepo.latestCompetitorPrices(productId, 5);
      const names = [...new Set(existing.map((c) => c.competitor))];
      const competitors = names.length > 0 ? names : ["SoundHub", "AudioMart"];

      await productRepo.addCompetitorPrices(
        productId,
        competitors.map((competitor) => ({
          competitor,
          price: Math.round(currentPrice * factor * 100) / 100,
          // Stamped now, so this becomes the freshest observation and the
          // Market Intelligence agent sees it as current.
          scrapedAt: now,
        })),
      );

      summary = `${competitors.length} competitors moved to ${(factor * 100 - 100).toFixed(1)}% of our price`;
      break;
    }

    case "demand_spike": {
      await productRepo.addDemandSignal({
        productId,
        signalType: "SKU_VELOCITY",
        value: Math.round((1 + magnitude / 100) * 100) / 100,
        periodStart: new Date(now.getTime() - 7 * 86_400_000),
        periodEnd: now,
      });
      summary = `Demand velocity raised by ${magnitude.toFixed(0)}%`;
      break;
    }

    case "new_competitor": {
      await productRepo.addCompetitorPrices(productId, [
        {
          competitor: NEW_ENTRANT_NAME,
          price: Math.round(currentPrice * (1 + magnitude / 100) * 100) / 100,
          scrapedAt: now,
        },
      ]);
      summary = `${NEW_ENTRANT_NAME} entered at ${(100 + magnitude).toFixed(0)}% of our price`;
      break;
    }
  }

  await auditService.record({
    orgId,
    userId: actorId,
    action: "MARKET_EVENT_SIMULATED",
    entityType: "Product",
    entityId: productId,
    afterValue: { eventType: event.eventType, magnitudePct: magnitude, summary },
  });

  return { eventType: event.eventType, magnitudePct: magnitude, summary };
}

function defaultMagnitude(eventType: MarketEvent["eventType"]): number {
  switch (eventType) {
    case "competitor_price_drop":
      return -15;
    case "competitor_price_increase":
      return 12;
    case "demand_spike":
      return 80;
    case "new_competitor":
      return -8;
  }
}
