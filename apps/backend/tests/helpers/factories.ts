import { CookieJar, readJson, type TestServer } from "./testServer";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "X-Pricewise-Client": "web",
};

export interface TenantFixture {
  orgName: string;
  orgId: string;
  adminJar: CookieJar;
  analystJar: CookieJar;
  productIds: string[];
  skus: string[];
  /** First seeded product. Non-optional so tests need no null dance
   *  noUncheckedIndexedAccess makes productIds[0] `string | undefined`. */
  firstProductId: string;
}

interface ProductSeed {
  sku: string;
  name: string;
  category: string;
  currentPrice: number;
  cost: number;
  marginFloorPct: number;
  inventoryLevel: number;
}

async function api(
  server: TestServer,
  method: string,
  path: string,
  body?: unknown,
  jar?: CookieJar,
) {
  return fetch(`${server.url}${path}`, {
    method,
    headers: { ...JSON_HEADERS, ...(jar ? { Cookie: jar.header() } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * Builds a fully-formed tenant through the real HTTP surface: an admin, an
 * analyst who joined by invite, and a seeded catalog. Going through the API
 * rather than seeding the database directly means the fixture itself exercises
 * signup, invite issuance and redemption, so an isolation test cannot pass
 * against a tenant that could not actually have been created.
 */
export async function createTestOrg(
  server: TestServer,
  opts: { name: string; slug: string; products?: ProductSeed[] },
): Promise<TenantFixture> {
  const password = "Pricewise2026!";
  const adminEmail = `admin@${opts.slug}.test`;
  const analystEmail = `analyst@${opts.slug}.test`;

  // 1. Admin + organization.
  const adminJar = new CookieJar();
  const signupRes = await api(server, "POST", "/auth/signup", {
    email: adminEmail,
    password,
    name: `${opts.name} Admin`,
    organizationName: opts.name,
  });
  adminJar.capture(signupRes);
  const signupBody = await readJson(signupRes);
  const orgId = signupBody.data?.organization?.id;
  if (!orgId) throw new Error(`fixture: signup failed for ${opts.slug}`);

  // 2. Analyst joins by invite, which is the only non-founder path in.
  const inviteRes = await api(
    server,
    "POST",
    "/org/invites",
    { email: analystEmail, role: "PRICING_ANALYST" },
    adminJar,
  );
  const inviteBody = (await inviteRes.json()) as { data?: { code?: string } };
  const code = inviteBody.data?.code;
  if (!code) throw new Error(`fixture: invite failed for ${opts.slug}`);

  const analystJar = new CookieJar();
  const joinRes = await api(server, "POST", "/auth/signup/invite", {
    email: analystEmail,
    password,
    name: `${opts.name} Analyst`,
    inviteCode: code,
  });
  analystJar.capture(joinRes);
  if (joinRes.status !== 201) throw new Error(`fixture: invite redemption failed for ${opts.slug}`);

  // 3. Catalog.
  const productIds: string[] = [];
  const skus: string[] = [];
  for (const product of opts.products ?? []) {
    const res = await api(server, "POST", "/products", product, adminJar);
    const body = (await res.json()) as { data?: { id?: string; sku?: string } };
    if (!body.data?.id) throw new Error(`fixture: product ${product.sku} failed`);
    productIds.push(body.data.id);
    skus.push(product.sku);
  }

  return {
    orgName: opts.name,
    orgId,
    adminJar,
    analystJar,
    productIds,
    skus,
    firstProductId: productIds[0] ?? "",
  };
}

export function product(overrides: Partial<ProductSeed> & { sku: string }): ProductSeed {
  return {
    name: "Test Product",
    category: "Electronics",
    currentPrice: 329.99,
    cost: 210.5,
    marginFloorPct: 0.15,
    inventoryLevel: 120,
    ...overrides,
  };
}

export { api, JSON_HEADERS };
