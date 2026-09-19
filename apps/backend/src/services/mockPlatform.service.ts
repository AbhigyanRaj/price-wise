import { env } from "../lib/env";
import { AppError } from "../lib/errors";

// Stands in for a Shopify/Amazon price-update API. A mock rather than a real
// integration, deliberately: it exercises the identical execution and rollback
// path while removing an external dependency that could fail during a demo.

export interface PlatformResult {
  sku: string;
  price: number;
  platformSyncedAt: string;
  platformRef: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function updatePlatformPrice(sku: string, newPrice: number): Promise<PlatformResult> {
  // Simulated latency, so loading states are actually visible in the demo
  // rather than completing too fast to see.
  await sleep(env.MOCK_PLATFORM_LATENCY_MS + Math.random() * 300);

  // Failure rate is environment-driven: 0 for deterministic E2E runs, 1 to
  // demonstrate rollback on demand, ~0.1 in development so the rollback path
  // is exercised regularly instead of rotting.
  if (Math.random() < env.MOCK_PLATFORM_FAILURE_RATE) {
    throw new AppError("EXECUTION_FAILED", "Platform rejected the price update", {
      sku,
      platformCode: "RATE_LIMIT_EXCEEDED",
      retryable: true,
    });
  }

  return {
    sku,
    price: newPrice,
    platformSyncedAt: new Date().toISOString(),
    platformRef: `PLT-${crypto.randomUUID().slice(0, 8)}`,
  };
}
