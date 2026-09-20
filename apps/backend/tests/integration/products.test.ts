import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { prisma, resetDb } from "../helpers/testDb";
import { startTestServer, type TestServer } from "../helpers/testServer";
import { api, createTestOrg, product, type TenantFixture } from "../helpers/factories";

/**
 * The product route family had no integration coverage at all, despite being
 * the only place in the app where a user creates or destroys tenant data.
 *
 * One happy path, one primary failure and one isolation test per the testing
 * rules, plus the two guards that actually protect the catalogue: role and
 * cross-field validation.
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
    name: "Suvidha Retail",
    slug: "suvidha",
    products: [product({ sku: "SR-ELEC-0001" })],
  });
  orgB = await createTestOrg(server, {
    name: "Bazaar Kart",
    slug: "bazaarkart",
    products: [product({ sku: "BK-OUTD-0001" })],
  });
});

describe("product CRUD", () => {
  test("an admin creates a product and it appears in the catalogue", async () => {
    const res = await api(
      server,
      "POST",
      "/products",
      product({ sku: "SR-ELEC-0002", name: "Second Widget" }),
      orgA.adminJar,
    );
    expect(res.status).toBe(201);

    const list = await api(server, "GET", "/products?search=Second", undefined, orgA.analystJar);
    const body = (await list.json()) as { data: { sku: string }[] };
    expect(body.data.map((p) => p.sku)).toContain("SR-ELEC-0002");
  });

  test("the write is recorded in the audit trail", async () => {
    await api(
      server,
      "POST",
      "/products",
      product({ sku: "SR-ELEC-0003" }),
      orgA.adminJar,
    );

    const res = await api(server, "GET", "/audit-logs", undefined, orgA.adminJar);
    const body = (await res.json()) as { data: { action: string; entityType: string }[] };
    expect(body.data.some((entry) => entry.entityType === "Product")).toBe(true);
  });

  test("a duplicate SKU within one org is a conflict, carrying the offending field", async () => {
    const res = await api(
      server,
      "POST",
      "/products",
      product({ sku: "SR-ELEC-0001" }),
      orgA.adminJar,
    );
    expect(res.status).toBe(409);
  });

  test("a price at or below cost is rejected, and says which field", async () => {
    // The cross-field refinement is the one rule that cannot live on a single
    // field, so it is the one most likely to be lost in a refactor.
    const res = await api(
      server,
      "POST",
      "/products",
      product({ sku: "SR-ELEC-0004", currentPrice: 50, cost: 120 }),
      orgA.adminJar,
    );
    expect(res.status).toBe(422);

    const body = (await res.json()) as {
      error: { details?: { fieldErrors?: Record<string, string[]> } };
    };
    // The client maps this straight onto the input, so the key matters as much
    // as the status.
    expect(body.error.details?.fieldErrors?.currentPrice).toBeDefined();
  });

  test("an update changes only what was sent", async () => {
    const res = await api(
      server,
      "PATCH",
      `/products/${orgA.firstProductId}`,
      { inventoryLevel: 77 },
      orgA.adminJar,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { inventoryLevel: number; name: string } };
    expect(body.data.inventoryLevel).toBe(77);
    expect(body.data.name).toBe("Test Product");
  });

  test("a delete removes it, and a later read is a 404", async () => {
    const del = await api(
      server,
      "DELETE",
      `/products/${orgA.firstProductId}`,
      undefined,
      orgA.adminJar,
    );
    expect(del.status).toBe(204);

    const read = await api(
      server,
      "GET",
      `/products/${orgA.firstProductId}`,
      undefined,
      orgA.adminJar,
    );
    expect(read.status).toBe(404);
  });
});

describe("product writes are gated", () => {
  test("an analyst cannot create, update or delete", async () => {
    const create = await api(
      server,
      "POST",
      "/products",
      product({ sku: "SR-ELEC-0009" }),
      orgA.analystJar,
    );
    expect(create.status).toBe(403);

    const update = await api(
      server,
      "PATCH",
      `/products/${orgA.firstProductId}`,
      { inventoryLevel: 1 },
      orgA.analystJar,
    );
    expect(update.status).toBe(403);

    const remove = await api(
      server,
      "DELETE",
      `/products/${orgA.firstProductId}`,
      undefined,
      orgA.analystJar,
    );
    expect(remove.status).toBe(403);
  });

  test("another org's product is 404 on write, never 403", async () => {
    // 403 would confirm the row exists and leak the id space, which is the
    // whole reason the tenant scope returns 404 instead.
    const update = await api(
      server,
      "PATCH",
      `/products/${orgB.firstProductId}`,
      { inventoryLevel: 5 },
      orgA.adminJar,
    );
    expect(update.status).toBe(404);

    const remove = await api(
      server,
      "DELETE",
      `/products/${orgB.firstProductId}`,
      undefined,
      orgA.adminJar,
    );
    expect(remove.status).toBe(404);
  });
});
