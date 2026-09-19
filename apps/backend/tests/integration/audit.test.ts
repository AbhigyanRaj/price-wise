import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { prisma, resetDb } from "../helpers/testDb";
import { startTestServer, type TestServer } from "../helpers/testServer";
import { api, createTestOrg, product, type TenantFixture } from "../helpers/factories";

/**
 * The audit trail is the product's memory of who did what. It had no
 * integration coverage, and search was added to it without any.
 */

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
    products: [product({ sku: "NW-ELEC-0001" })],
  });
  orgB = await createTestOrg(server, {
    name: "Meridian Goods",
    slug: "meridian",
    products: [product({ sku: "MG-OUTD-0001" })],
  });
});

async function entries(fixture: TenantFixture, query = "") {
  const res = await api(server, "GET", `/audit-logs${query}`, undefined, fixture.adminJar);
  const body = (await res.json()) as { data: { action: string; entityType: string }[] };
  return body.data;
}

describe("audit search", () => {
  test("matches on action, case-insensitively", async () => {
    const all = await entries(orgA);
    expect(all.length).toBeGreaterThan(0);

    const found = await entries(orgA, "?search=product");
    expect(found.length).toBeGreaterThan(0);
    // Matches entityType as well as action, which is why a lowercase query
    // finds an uppercase action name.
    expect(
      found.every(
        (e) =>
          e.action.toLowerCase().includes("product") ||
          e.entityType.toLowerCase().includes("product"),
      ),
    ).toBe(true);
  });

  test("a query matching nothing returns nothing, not everything", async () => {
    // The failure mode worth guarding: a filter silently ignored reads as a
    // working search that happens to match every row.
    const found = await entries(orgA, "?search=zzzznomatch");
    expect(found).toHaveLength(0);
  });

  test("search is scoped to the caller's organization", async () => {
    const a = await entries(orgA, "?search=product");
    const b = await entries(orgB, "?search=product");

    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);

    // Both orgs have matching rows, and neither can see the other's. A search
    // that forgot its tenant scope would return the union.
    const idsA = new Set(a.map((e) => JSON.stringify(e)));
    expect(b.some((e) => idsA.has(JSON.stringify(e)))).toBe(false);
  });

  test("search composes with the action filter rather than replacing it", async () => {
    const all = await entries(orgA);
    const action = all[0]?.action;
    expect(action).toBeDefined();

    const found = await entries(orgA, `?action=${action}&search=zzzznomatch`);
    // Both conditions apply. If the OR clause had leaked to the top level it
    // would override the equality filter and return rows.
    expect(found).toHaveLength(0);
  });
});

describe("audit trail is append only", () => {
  test("no route exposes a write, update or delete", async () => {
    for (const method of ["POST", "PATCH", "DELETE"] as const) {
      const res = await api(server, method, "/audit-logs", {}, orgA.adminJar);
      expect(res.status).toBe(404);
    }
  });
});
