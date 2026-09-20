import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { prisma, resetDb } from "../helpers/testDb";
import { readJson, startTestServer, type TestServer } from "../helpers/testServer";
import { api, createTestOrg, product, type TenantFixture } from "../helpers/factories";

// The isolation matrix. Every row here is a way Org B might reach Org A's data;
// CI fails if any of them starts succeeding.

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
    products: [
      product({ sku: "SR-ELEC-0001", name: "Suvidha Headphones" }),
      product({ sku: "SR-HOME-0002", name: "Suvidha Kettle", category: "Home & Kitchen" }),
    ],
  });

  orgB = await createTestOrg(server, {
    name: "Bazaar Kart",
    slug: "bazaarkart",
    products: [product({ sku: "BK-OUTD-0001", name: "Bazaar Kart Tent", category: "Outdoor" })],
  });
});

describe("tenant isolation, Product", () => {
  test("READ: Org B cannot fetch Org A's product by id, 404, never 403", async () => {
    const res = await api(server, "GET", `/products/${orgA.firstProductId}`, undefined, orgB.adminJar);
    const body = await readJson(res);

    // 403 would confirm the resource exists and leak Org A's id space (MT-4).
    expect(res.status).toBe(404);
    expect(body.error?.code).toBe("NOT_FOUND");
    expect(res.status).not.toBe(403);
  });

  test("LIST: Org A's products never appear in Org B's listing", async () => {
    const res = await api(server, "GET", "/products?pageSize=100", undefined, orgB.adminJar);
    const body = (await res.json()) as { data: { sku: string }[]; pagination: { totalCount: number } };

    const skus = body.data.map((p) => p.sku);
    expect(skus).toEqual(["BK-OUTD-0001"]);
    for (const sku of orgA.skus) expect(skus).not.toContain(sku);
    // The count must also be scoped, or pagination leaks the other org's size.
    expect(body.pagination.totalCount).toBe(1);
  });

  test("UPDATE: Org B patching Org A's product changes nothing", async () => {
    const res = await api(
      server,
      "PATCH",
      `/products/${orgA.firstProductId}`,
      { currentPrice: 1 },
      orgB.adminJar,
    );
    expect(res.status).toBe(404);

    const untouched = await prisma.product.findUnique({ where: { id: orgA.firstProductId } });
    expect(Number(untouched?.currentPrice)).toBe(329.99);
  });

  test("DELETE: Org B cannot delete Org A's product", async () => {
    const res = await api(
      server,
      "DELETE",
      `/products/${orgA.firstProductId}`,
      undefined,
      orgB.adminJar,
    );
    expect(res.status).toBe(404);
    expect(await prisma.product.count({ where: { organizationId: orgA.orgId } })).toBe(2);
  });

  test("SKU uniqueness is per-tenant: the same SKU is fine in two orgs", async () => {
    const shared = product({ sku: "SHARED-0001", name: "Same SKU" });

    const inA = await api(server, "POST", "/products", shared, orgA.adminJar);
    const inB = await api(server, "POST", "/products", shared, orgB.adminJar);
    expect(inA.status).toBe(201);
    expect(inB.status).toBe(201);

    // ...but a duplicate WITHIN one org is a conflict.
    const dupe = await api(server, "POST", "/products", shared, orgA.adminJar);
    expect(dupe.status).toBe(409);
  });
});

describe("tenant isolation, Organization settings", () => {
  test("each org reads only its own settings", async () => {
    // Read A's threshold BEFORE touching B, rather than asserting a literal.
    // The property under test is "B's write did not reach A", which is true
    // whatever the schema default happens to be. Hardcoding the default made
    // this test fail the day the default was recalibrated, which told us
    // nothing about tenant isolation.
    const beforeRes = await api(server, "GET", "/org/settings", undefined, orgA.adminJar);
    const before = (await beforeRes.json()) as { data: { confidenceThreshold: number } };
    const aThresholdBefore = before.data.confidenceThreshold;
    expect(aThresholdBefore).not.toBe(0.75);

    await api(server, "PATCH", "/org/settings", { confidenceThreshold: 0.75 }, orgB.adminJar);

    const aRes = await api(server, "GET", "/org/settings", undefined, orgA.adminJar);
    const bRes = await api(server, "GET", "/org/settings", undefined, orgB.adminJar);
    const a = (await aRes.json()) as { data: { name: string; confidenceThreshold: number } };
    const b = (await bRes.json()) as { data: { name: string; confidenceThreshold: number } };

    expect(a.data.name).toBe("Suvidha Retail");
    expect(b.data.name).toBe("Bazaar Kart");
    // Org B's change must not have touched Org A.
    expect(a.data.confidenceThreshold).toBe(aThresholdBefore);
    expect(b.data.confidenceThreshold).toBe(0.75);
  });

  test("members listing is scoped to the caller's organization", async () => {
    const res = await api(server, "GET", "/org/members", undefined, orgA.adminJar);
    const body = (await res.json()) as { data: { email: string }[] };

    const emails = body.data.map((u) => u.email);
    expect(emails).toContain("admin@suvidha.test");
    expect(emails).toContain("analyst@suvidha.test");
    expect(emails).not.toContain("admin@bazaarkart.test");
  });
});

describe("tenant isolation, Invite", () => {
  test("Org B cannot revoke Org A's invite", async () => {
    const created = await api(
      server,
      "POST",
      "/org/invites",
      { email: "newcomer@suvidha.test", role: "PRICING_ANALYST" },
      orgA.adminJar,
    );
    const invite = (await created.json()) as { data: { id: string } };

    const res = await api(
      server,
      "DELETE",
      `/org/invites/${invite.data.id}`,
      undefined,
      orgB.adminJar,
    );
    expect(res.status).toBe(404);

    const stillValid = await prisma.invite.findUnique({ where: { id: invite.data.id } });
    expect(stillValid?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("an invite cannot be redeemed under a different email address", async () => {
    const created = await api(
      server,
      "POST",
      "/org/invites",
      { email: "intended@suvidha.test", role: "PRICING_ANALYST" },
      orgA.adminJar,
    );
    const invite = (await created.json()) as { data: { code: string } };

    const res = await api(server, "POST", "/auth/signup/invite", {
      email: "attacker@elsewhere.test",
      password: "Pricewise2026!",
      name: "Eve",
      inviteCode: invite.data.code,
    });

    expect(res.status).toBe(400);
    expect((await readJson(res)).error?.code).toBe("INVITE_INVALID");
  });

  test("an invite is single-use", async () => {
    const created = await api(
      server,
      "POST",
      "/org/invites",
      { email: "once@suvidha.test", role: "PRICING_ANALYST" },
      orgA.adminJar,
    );
    const invite = (await created.json()) as { data: { code: string } };

    const body = {
      email: "once@suvidha.test",
      password: "Pricewise2026!",
      name: "Once",
      inviteCode: invite.data.code,
    };

    expect((await api(server, "POST", "/auth/signup/invite", body)).status).toBe(201);
    expect((await api(server, "POST", "/auth/signup/invite", body)).status).toBe(400);
  });
});

describe("client-supplied organizationId is ignored", () => {
  test("a smuggled organizationId in the body cannot retarget a write", async () => {
    const res = await api(
      server,
      "POST",
      "/products",
      { ...product({ sku: "SMUGGLE-0001" }), organizationId: orgA.orgId },
      orgB.adminJar,
    );
    expect(res.status).toBe(201);

    // It must have landed in Org B, the caller's token, not in the org they named.
    const created = await prisma.product.findFirst({ where: { sku: "SMUGGLE-0001" } });
    expect(created?.organizationId).toBe(orgB.orgId);
    expect(created?.organizationId).not.toBe(orgA.orgId);
  });

  test("a smuggled organizationId in the query string cannot widen a read", async () => {
    const res = await api(
      server,
      "GET",
      `/products?organizationId=${orgA.orgId}&pageSize=100`,
      undefined,
      orgB.adminJar,
    );
    const body = (await res.json()) as { data: { sku: string }[] };

    expect(body.data.map((p) => p.sku)).toEqual(["BK-OUTD-0001"]);
  });
});

describe("RBAC is enforced server-side", () => {
  test("an analyst cannot create, update or delete a product", async () => {
    const create = await api(
      server,
      "POST",
      "/products",
      product({ sku: "ANALYST-0001" }),
      orgA.analystJar,
    );
    const patch = await api(
      server,
      "PATCH",
      `/products/${orgA.firstProductId}`,
      { currentPrice: 400 },
      orgA.analystJar,
    );
    const del = await api(
      server,
      "DELETE",
      `/products/${orgA.firstProductId}`,
      undefined,
      orgA.analystJar,
    );

    expect(create.status).toBe(403);
    expect(patch.status).toBe(403);
    expect(del.status).toBe(403);
    expect((await readJson(create)).error?.code).toBe("FORBIDDEN_ROLE");
  });

  test("an analyst can read the catalog", async () => {
    const res = await api(server, "GET", "/products", undefined, orgA.analystJar);
    expect(res.status).toBe(200);
  });

  test("an analyst cannot change organization settings or issue invites", async () => {
    const settings = await api(
      server,
      "PATCH",
      "/org/settings",
      { confidenceThreshold: 0.5 },
      orgA.analystJar,
    );
    const invite = await api(
      server,
      "POST",
      "/org/invites",
      { email: "x@suvidha.test", role: "ADMIN" },
      orgA.analystJar,
    );

    expect(settings.status).toBe(403);
    expect(invite.status).toBe(403);
  });

  test("an analyst CAN read settings, the UI shows the threshold", async () => {
    const res = await api(server, "GET", "/org/settings", undefined, orgA.analystJar);
    expect(res.status).toBe(200);
  });
});
