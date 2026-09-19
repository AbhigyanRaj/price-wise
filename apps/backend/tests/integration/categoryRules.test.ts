import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { prisma, resetDb } from "../helpers/testDb";
import { startTestServer, type TestServer } from "../helpers/testServer";
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
    products: [product({ sku: "NW-ELEC-0001", category: "Electronics" })],
  });
  orgB = await createTestOrg(server, {
    name: "Meridian Goods",
    slug: "meridian",
    products: [product({ sku: "MG-OUTD-0001", category: "Outdoor" })],
  });
});

const RULE = { category: "Electronics", marginFloorPct: 0.4, maxDeltaPct: 0.1 };

describe("category rules", () => {
  test("an admin sets a rule and any member can read it", async () => {
    const put = await api(server, "PUT", "/org/category-rules", RULE, orgA.adminJar);
    expect(put.status).toBe(200);

    const read = await api(server, "GET", "/org/category-rules", undefined, orgA.analystJar);
    const body = (await read.json()) as { data: { category: string; marginFloorPct: number }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.marginFloorPct).toBe(0.4);
  });

  test("PUT is idempotent: setting the same category twice leaves one row", async () => {
    await api(server, "PUT", "/org/category-rules", RULE, orgA.adminJar);
    await api(server, "PUT", "/org/category-rules", { ...RULE, marginFloorPct: 0.5 }, orgA.adminJar);

    const read = await api(server, "GET", "/org/category-rules", undefined, orgA.adminJar);
    const body = (await read.json()) as { data: { marginFloorPct: number }[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.marginFloorPct).toBe(0.5);
  });

  test("a category with no products is rejected, naming the field", async () => {
    // A rule on a typo'd category is invisible dead configuration.
    const res = await api(
      server,
      "PUT",
      "/org/category-rules",
      { ...RULE, category: "Electronicss" },
      orgA.adminJar,
    );
    expect(res.status).toBe(422);

    const body = (await res.json()) as {
      error: { details?: { fieldErrors?: Record<string, string[]> } };
    };
    expect(body.error.details?.fieldErrors?.category).toBeDefined();
  });

  test("an analyst cannot write or delete", async () => {
    const put = await api(server, "PUT", "/org/category-rules", RULE, orgA.analystJar);
    expect(put.status).toBe(403);

    await api(server, "PUT", "/org/category-rules", RULE, orgA.adminJar);
    const del = await api(
      server,
      "DELETE",
      "/org/category-rules/Electronics",
      undefined,
      orgA.analystJar,
    );
    expect(del.status).toBe(403);
  });

  test("rules are scoped: Org B cannot see or delete Org A's", async () => {
    await api(server, "PUT", "/org/category-rules", RULE, orgA.adminJar);

    const read = await api(server, "GET", "/org/category-rules", undefined, orgB.adminJar);
    const body = (await read.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(0);

    // 404, not 403: a 403 would confirm Org A has a rule for that category.
    const del = await api(
      server,
      "DELETE",
      "/org/category-rules/Electronics",
      undefined,
      orgB.adminJar,
    );
    expect(del.status).toBe(404);
  });

  test("a delete is audited, and the rule is gone", async () => {
    await api(server, "PUT", "/org/category-rules", RULE, orgA.adminJar);
    const del = await api(
      server,
      "DELETE",
      "/org/category-rules/Electronics",
      undefined,
      orgA.adminJar,
    );
    expect(del.status).toBe(204);

    const read = await api(server, "GET", "/org/category-rules", undefined, orgA.adminJar);
    expect(((await read.json()) as { data: unknown[] }).data).toHaveLength(0);

    const audit = await api(server, "GET", "/audit-logs?search=CATEGORY_RULE", undefined, orgA.adminJar);
    const trail = (await audit.json()) as { data: { action: string }[] };
    expect(trail.data.some((e) => e.action === "CATEGORY_RULE_DELETED")).toBe(true);
  });
});
