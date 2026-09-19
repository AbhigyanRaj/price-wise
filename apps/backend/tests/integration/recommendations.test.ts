import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { prisma, resetDb } from "../helpers/testDb";
import { readJson, startTestServer, type TestServer } from "../helpers/testServer";
import { api, createTestOrg, product, type TenantFixture } from "../helpers/factories";

let server: TestServer;
let orgA: TenantFixture;
let orgB: TenantFixture;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  orgA = await createTestOrg(server, {
    name: "Northwind Retail",
    slug: "northwind",
    products: [product({ sku: "NW-ELEC-0001", currentPrice: 329.99, cost: 210.5, marginFloorPct: 0.15 })],
  });
  orgB = await createTestOrg(server, {
    name: "Meridian Goods",
    slug: "meridian",
    products: [product({ sku: "MG-OUTD-0001" })],
  });
});

/** Inserts a PENDING recommendation directly. The pipeline that normally
 *  produces one is Part B; these tests are about the human half. */
async function seedPending(fixture: TenantFixture, recommendedPrice = 299.99) {
  return prisma.pricingRecommendation.create({
    data: {
      organizationId: fixture.orgId,
      productId: fixture.firstProductId,
      recommendedPrice,
      currentPriceAtTime: 329.99,
      confidenceScore: 0.82,
      rationale: "Competitor median is below our price; closing most of the gap.",
      status: "PENDING",
    },
  });
}

describe("GET /recommendations", () => {
  test("cursor paging returns every row exactly once", async () => {
    for (let i = 0; i < 7; i++) await seedPending(orgA, 300 + i);

    const seen: string[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 5; page++) {
      const url: string = `/recommendations?limit=3${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await api(server, "GET", url, undefined, orgA.analystJar);
      const body = (await res.json()) as {
        data: { id: string }[];
        pagination: { nextCursor: string | null; hasMore: boolean };
      };

      seen.push(...body.data.map((r) => r.id));
      if (!body.pagination.hasMore) break;
      cursor = body.pagination.nextCursor;
    }

    expect(seen).toHaveLength(7);
    // No duplicates and no omissions, the property offset paging loses.
    expect(new Set(seen).size).toBe(7);
  });

  test("is scoped to the caller's organization", async () => {
    await seedPending(orgA);
    const res = await api(server, "GET", "/recommendations", undefined, orgB.analystJar);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);
  });

  test("filters by status", async () => {
    const rec = await seedPending(orgA);
    await prisma.pricingRecommendation.update({ where: { id: rec.id }, data: { status: "REJECTED" } });
    await seedPending(orgA);

    const res = await api(server, "GET", "/recommendations?status=PENDING", undefined, orgA.analystJar);
    const body = (await res.json()) as { data: { status: string }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.status).toBe("PENDING");
  });
});

describe("GET /recommendations/:id", () => {
  test("Org B gets 404 for Org A's recommendation, never 403", async () => {
    const rec = await seedPending(orgA);
    const res = await api(server, "GET", `/recommendations/${rec.id}`, undefined, orgB.adminJar);

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  test("returns the agent trail and comparable history", async () => {
    const rec = await seedPending(orgA);
    await prisma.agentRun.create({
      data: {
        recommendationId: rec.id,
        agentName: "MARKET_INTELLIGENCE",
        input: { sku: "NW-ELEC-0001" },
        output: { trend: "falling" },
        toolCalls: [{ name: "get_competitor_prices", args: { lookbackDays: 7 } }],
        confidence: 0.91,
        model: "openai/gpt-oss-20b",
        promptTokens: 1240,
        completionTokens: 318,
        durationMs: 1840,
      },
    });

    const res = await api(server, "GET", `/recommendations/${rec.id}`, undefined, orgA.analystJar);
    const body = (await res.json()) as {
      data: { agentRuns: { agentName: string; toolCalls: unknown }[]; comparable: unknown[] };
    };

    expect(body.data.agentRuns).toHaveLength(1);
    expect(body.data.agentRuns[0]?.agentName).toBe("MARKET_INTELLIGENCE");
    // Tool arguments must survive to the client, FR-EXP-3.
    expect(JSON.stringify(body.data.agentRuns[0]?.toolCalls)).toContain("lookbackDays");
    expect(body.data.comparable).toHaveLength(0);
  });
});

describe("approve / reject / modify", () => {
  test("approving changes the product price and records an execution", async () => {
    const rec = await seedPending(orgA, 299.99);
    const res = await api(server, "POST", `/recommendations/${rec.id}/approve`, undefined, orgA.analystJar);

    // Surface the error envelope on failure. A bare "expected 200, got 502"
    // says nothing about which of the several execution guards fired, which
    // cost an afternoon the first time this failed only on CI.
    if (res.status !== 200) throw new Error(`approve failed: ${res.status} ${await res.text()}`);
    expect(res.status).toBe(200);

    const productAfter = await prisma.product.findUnique({ where: { id: orgA.firstProductId } });
    expect(Number(productAfter?.currentPrice)).toBe(299.99);

    const execution = await prisma.priceExecution.findFirst({ where: { recommendationId: rec.id } });
    expect(execution?.succeeded).toBe(true);
    expect(execution?.rolledBack).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "RECOMMENDATION_APPROVED", entityId: rec.id },
    });
    expect(audit).not.toBeNull();
  });

  test("approving twice returns 409 and does not execute again", async () => {
    const rec = await seedPending(orgA, 299.99);

    const first = await api(server, "POST", `/recommendations/${rec.id}/approve`, undefined, orgA.analystJar);
    const second = await api(server, "POST", `/recommendations/${rec.id}/approve`, undefined, orgA.analystJar);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect((await readJson(second)).error?.code).toBe("CONFLICT");

    expect(await prisma.priceExecution.count({ where: { recommendationId: rec.id } })).toBe(1);
  });

  /**
   * Rule R10. Two analysts clicking approve at the same instant must not both
   * succeed, a read-then-check would let both through and push the price
   * change twice. The status lives inside the UPDATE's WHERE clause, so exactly
   * one claim wins.
   */
  test("concurrent approvals: exactly one wins, exactly one execution happens", async () => {
    const rec = await seedPending(orgA, 299.99);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api(server, "POST", `/recommendations/${rec.id}/approve`, undefined, orgA.analystJar),
      ),
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);

    expect(await prisma.priceExecution.count({ where: { recommendationId: rec.id } })).toBe(1);
  });

  test("rejecting leaves the product price untouched and stores the reason", async () => {
    const rec = await seedPending(orgA, 299.99);
    const reason = "Bundle promotion launches Thursday; cutting now undermines it.";

    const res = await api(
      server,
      "POST",
      `/recommendations/${rec.id}/reject`,
      { reason },
      orgA.analystJar,
    );
    expect(res.status).toBe(200);

    const productAfter = await prisma.product.findUnique({ where: { id: orgA.firstProductId } });
    expect(Number(productAfter?.currentPrice)).toBe(329.99);

    const stored = await prisma.pricingRecommendation.findUnique({ where: { id: rec.id } });
    expect(stored?.status).toBe("REJECTED");
    expect(stored?.rejectionReason).toBe(reason);
  });

  test("rejecting with a too-short reason is refused", async () => {
    const rec = await seedPending(orgA);
    const res = await api(server, "POST", `/recommendations/${rec.id}/reject`, { reason: "no" }, orgA.analystJar);

    expect(res.status).toBe(422);
    expect((await readJson(res)).error?.code).toBe("VALIDATION_ERROR");
  });

  test("a human modification is still subject to the margin floor", async () => {
    const rec = await seedPending(orgA);
    // Cost 210.50 at a 15% floor gives a floor price of ~247.65.
    const res = await api(
      server,
      "POST",
      `/recommendations/${rec.id}/modify`,
      { modifiedPrice: 215 },
      orgA.analystJar,
    );

    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(body.error?.details)).toContain("MARGIN_FLOOR");

    // And the price is untouched.
    const productAfter = await prisma.product.findUnique({ where: { id: orgA.firstProductId } });
    expect(Number(productAfter?.currentPrice)).toBe(329.99);
  });

  test("a valid modification executes and records both prices", async () => {
    const rec = await seedPending(orgA, 299.99);
    const res = await api(
      server,
      "POST",
      `/recommendations/${rec.id}/modify`,
      { modifiedPrice: 309.0 },
      orgA.analystJar,
    );

    expect(res.status).toBe(200);

    const productAfter = await prisma.product.findUnique({ where: { id: orgA.firstProductId } });
    expect(Number(productAfter?.currentPrice)).toBe(309);

    // Both the AI's number and the human's are stored, the raw material for
    // ever answering "are these recommendations any good?" (TR-8).
    const audit = await prisma.auditLog.findFirst({
      where: { action: "RECOMMENDATION_MODIFIED", entityId: rec.id },
    });
    const before = JSON.stringify(audit?.beforeValue);
    const after = JSON.stringify(audit?.afterValue);
    expect(before).toContain("299.99");
    expect(after).toContain("309");
  });

  test("Org B cannot approve Org A's recommendation", async () => {
    const rec = await seedPending(orgA);
    const res = await api(server, "POST", `/recommendations/${rec.id}/approve`, undefined, orgB.analystJar);
    expect(res.status).toBe(404);
  });
});

describe("GET /audit-logs", () => {
  test("is scoped, filterable by action, and paginated", async () => {
    const rec = await seedPending(orgA, 299.99);
    await api(server, "POST", `/recommendations/${rec.id}/approve`, undefined, orgA.analystJar);

    const res = await api(
      server,
      "GET",
      "/audit-logs?action=RECOMMENDATION_APPROVED",
      undefined,
      orgA.adminJar,
    );
    const body = (await res.json()) as {
      data: { action: string }[];
      pagination: { hasMore: boolean };
    };

    expect(res.status).toBe(200);
    expect(body.data.every((e) => e.action === "RECOMMENDATION_APPROVED")).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const otherOrg = await api(server, "GET", "/audit-logs", undefined, orgB.adminJar);
    const otherBody = (await otherOrg.json()) as { data: { entityId: string }[] };
    expect(otherBody.data.some((e) => e.entityId === rec.id)).toBe(false);
  });

  test("exposes no write route", async () => {
    const patch = await api(server, "PATCH", "/audit-logs", {}, orgA.adminJar);
    const del = await api(server, "DELETE", "/audit-logs", undefined, orgA.adminJar);
    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
  });
});
