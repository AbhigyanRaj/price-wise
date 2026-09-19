import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { prisma, resetDb } from "../helpers/testDb";
import {
  CookieJar,
  readJson,
  startTestServer,
  type TestServer,
} from "../helpers/testServer";

let server: TestServer;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  // The CSRF guard requires this on state-changing verbs.
  "X-Pricewise-Client": "web",
};

const ADA = {
  email: "ada@northwind.test",
  password: "Pricewise2026!",
  name: "Ada Admin",
  organizationName: "Northwind Retail",
};

function post(path: string, body?: unknown, jar?: CookieJar) {
  return fetch(`${server.url}${path}`, {
    method: "POST",
    headers: { ...JSON_HEADERS, ...(jar ? { Cookie: jar.header() } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Signs up a fresh org and returns a jar holding its session cookies. */
async function signupWithJar(overrides: Partial<typeof ADA> = {}) {
  const jar = new CookieJar();
  const res = await post("/auth/signup", { ...ADA, ...overrides });
  jar.capture(res);
  return { res, jar, body: await readJson(res) };
}

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

describe("POST /auth/signup", () => {
  test("creates exactly one organization, one ADMIN user and one audit row", async () => {
    const { res, body } = await signupWithJar();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data?.user?.role).toBe("ADMIN");
    expect(body.data?.organization?.name).toBe("Northwind Retail");

    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "ORG_CREATED" } })).toBe(1);
  });

  test("never serialises passwordHash", async () => {
    const { body } = await signupWithJar();
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(JSON.stringify(body)).not.toContain("$argon2");
  });

  test("sets httpOnly cookies, with refresh scoped to /auth", async () => {
    const res = await post("/auth/signup", ADA);
    const cookies = res.headers.getSetCookie();

    const access = cookies.find((c) => c.startsWith("access_token="));
    const refresh = cookies.find((c) => c.startsWith("refresh_token="));

    expect(access).toContain("HttpOnly");
    expect(refresh).toContain("HttpOnly");
    // Not sent on ordinary API calls, only to the one route that consumes it.
    expect(refresh).toContain("Path=/auth");
    // onrender.com is on the Public Suffix List, so a Domain attribute would be
    // rejected by browsers. It must never appear.
    expect(refresh).not.toContain("Domain=");
  });

  test("rejects a duplicate email with 409", async () => {
    await signupWithJar();
    const res = await post("/auth/signup", { ...ADA, organizationName: "Other" });
    const body = await readJson(res);

    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("EMAIL_IN_USE");
    expect(await prisma.organization.count()).toBe(1);
  });

  test("rejects a weak password with 422 and a field-level detail", async () => {
    const res = await post("/auth/signup", { ...ADA, password: "weak" });
    const body = await readJson(res);

    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(body.error?.details?.fieldErrors ?? {})).toContain("password");
  });

  test("normalises email case and surrounding whitespace", async () => {
    await signupWithJar({ email: "  Ada@Northwind.TEST  " });
    const user = await prisma.user.findFirst();
    expect(user?.email).toBe("ada@northwind.test");
  });
});

describe("POST /auth/login", () => {
  test("succeeds and issues cookies", async () => {
    await signupWithJar();
    const jar = new CookieJar();
    const res = await post("/auth/login", { email: ADA.email, password: ADA.password });
    jar.capture(res);

    expect(res.status).toBe(200);
    expect(jar.get("access_token")).toBeTruthy();
    expect(jar.get("refresh_token")).toBeTruthy();
  });

  test("gives an identical response for a wrong password and an unknown email", async () => {
    await signupWithJar();

    const wrongPassword = await post("/auth/login", {
      email: ADA.email,
      password: "NotThePassword1",
    });
    const unknownEmail = await post("/auth/login", {
      email: "nobody@northwind.test",
      password: "NotThePassword1",
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical bodies: the response must not reveal whether an account exists.
    expect(await readJson(wrongPassword)).toEqual(await readJson(unknownEmail));
  });
});

describe("GET /auth/me", () => {
  test("401 without cookies", async () => {
    const res = await fetch(`${server.url}/auth/me`);
    expect(res.status).toBe(401);
    expect((await readJson(res)).error?.code).toBe("UNAUTHENTICATED");
  });

  test("returns the current user and organization with cookies", async () => {
    const { jar } = await signupWithJar();
    const res = await fetch(`${server.url}/auth/me`, { headers: { Cookie: jar.header() } });
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.data?.user?.email).toBe(ADA.email);
    expect(body.data?.organization?.name).toBe("Northwind Retail");
  });
});

describe("POST /auth/refresh, rotation and theft detection", () => {
  test("issues a different refresh token on every use", async () => {
    const { jar } = await signupWithJar();
    const before = jar.get("refresh_token");

    const res = await post("/auth/refresh", undefined, jar);
    jar.capture(res);

    expect(res.status).toBe(200);
    expect(jar.get("refresh_token")).not.toBe(before);
  });

  test("replaying a rotated token revokes the entire chain", async () => {
    const { jar } = await signupWithJar();
    const stolen = jar.get("refresh_token")!;

    // Legitimate rotation.
    const rotated = await post("/auth/refresh", undefined, jar);
    jar.capture(rotated);
    const current = jar.get("refresh_token")!;

    // An attacker replays the old token. It is validly signed and known, but
    // already rotated, evidence that two parties hold it.
    const replay = await fetch(`${server.url}/auth/refresh`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: `refresh_token=${stolen}` },
    });
    expect(replay.status).toBe(401);

    // The legitimate client's CURRENT token is now dead too. That is the point:
    // the chain burns, forcing a re-login, so a stolen token has a bounded life.
    const afterBurn = await fetch(`${server.url}/auth/refresh`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: `refresh_token=${current}` },
    });
    expect(afterBurn.status).toBe(401);
    expect((await readJson(afterBurn)).error?.code).toBe("REFRESH_INVALID");
  });

  test("401 when no refresh cookie is presented", async () => {
    const res = await post("/auth/refresh");
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  test("revokes the refresh token server-side", async () => {
    const { jar } = await signupWithJar();
    const beforeLogout = jar.get("refresh_token")!;

    const res = await post("/auth/logout", undefined, jar);
    expect(res.status).toBe(200);

    const reuse = await fetch(`${server.url}/auth/refresh`, {
      method: "POST",
      headers: { ...JSON_HEADERS, Cookie: `refresh_token=${beforeLogout}` },
    });
    expect(reuse.status).toBe(401);

    const stored = await prisma.refreshToken.findFirst();
    expect(stored?.revokedAt).not.toBeNull();
  });
});

describe("cross-cutting middleware", () => {
  test("blocks a state-changing request without the CSRF client header", async () => {
    const res = await fetch(`${server.url}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADA.email, password: ADA.password }),
    });
    expect(res.status).toBe(403);
  });

  test("rate-limits repeated failed logins but not successful ones", async () => {
    await signupWithJar();

    // Ten failures against one address/email pair exhausts the window.
    for (let i = 0; i < 10; i++) {
      await post("/auth/login", { email: ADA.email, password: "WrongPassword9" });
    }

    const blocked = await post("/auth/login", { email: ADA.email, password: "WrongPassword9" });
    expect(blocked.status).toBe(429);
    expect((await readJson(blocked)).error?.code).toBe("RATE_LIMITED");
    expect(blocked.headers.get("retry-after")).toBeTruthy();

    // A different email is a different key, so one user's failures cannot lock
    // out another's account.
    const other = await post("/auth/login", { email: "someone@else.test", password: "x" });
    expect(other.status).toBe(401);
  });

  test("returns the error envelope for an unknown route", async () => {
    const res = await fetch(`${server.url}/does-not-exist`);
    const body = await readJson(res);

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("NOT_FOUND");
  });

  test("attaches a correlation id to every response", async () => {
    const res = await fetch(`${server.url}/healthz`);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  test("applies security headers", async () => {
    const res = await fetch(`${server.url}/healthz`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
