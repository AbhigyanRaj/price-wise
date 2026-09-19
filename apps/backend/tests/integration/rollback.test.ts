import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { env } from "../../src/lib/env";
import { prisma, resetDb } from "../helpers/testDb";
import { startTestServer, type TestServer } from "../helpers/testServer";
import { api, createTestOrg, product, type TenantFixture } from "../helpers/factories";

// The platform is forced to fail for this whole file rather than relying on the
// injected failure rate, which would make the assertion flaky. This exercises
// the real execution path; only the outermost network call is made to fail.
//
// Driven through the service's own env knob rather than mock.module(), because
// a module mock in Bun is GLOBAL and outlives the file that declared it. This
// file used to replace mockPlatform for the whole process, so whichever files
// ran after it saw every price execution fail. It passed locally, where the
// alphabetical order puts this file late, and failed on CI, where it does not.
// A test that breaks other tests depending on filename order is worse than no
// test.
let server: TestServer;
let org: TenantFixture;
let originalFailureRate: number;

beforeAll(async () => {
  originalFailureRate = env.MOCK_PLATFORM_FAILURE_RATE;
  env.MOCK_PLATFORM_FAILURE_RATE = 1; // Math.random() is always below 1.
  server = await startTestServer();
});

afterAll(async () => {
  // Restored, so this file cannot affect any that runs after it.
  env.MOCK_PLATFORM_FAILURE_RATE = originalFailureRate;
  await server.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  org = await createTestOrg(server, {
    name: "Northwind Retail",
    slug: "northwind",
    products: [product({ sku: "NW-ELEC-0001", currentPrice: 329.99, cost: 210.5 })],
  });
});

describe("execution rollback", () => {
  test("a failed platform push reverts the local price and records the attempt", async () => {
    const rec = await prisma.pricingRecommendation.create({
      data: {
        organizationId: org.orgId,
        productId: org.firstProductId,
        recommendedPrice: 299.99,
        currentPriceAtTime: 329.99,
        confidenceScore: 0.82,
        rationale: "Closing the competitive gap.",
        status: "PENDING",
      },
    });

    const res = await api(server, "POST", `/recommendations/${rec.id}/approve`, undefined, org.analystJar);
    expect(res.status).toBe(502);

    // The database must never claim a price the platform does not have.
    const after = await prisma.product.findUnique({ where: { id: org.firstProductId } });
    expect(Number(after?.currentPrice)).toBe(329.99);

    const execution = await prisma.priceExecution.findFirst({ where: { recommendationId: rec.id } });
    expect(execution?.succeeded).toBe(false);
    expect(execution?.rolledBack).toBe(true);

    // Demoted back to the queue rather than lost (FR-EXE-5).
    const stored = await prisma.pricingRecommendation.findUnique({ where: { id: rec.id } });
    expect(stored?.status).toBe("PENDING");

    const audit = await prisma.auditLog.findFirst({ where: { action: "PRICE_EXECUTION_FAILED" } });
    expect(audit).not.toBeNull();
  });
});
