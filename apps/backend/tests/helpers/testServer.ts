import type { Server } from "node:http";
import { createApp } from "../../src/app";

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

/** Binds the app to an ephemeral port so tests exercise the real middleware
 *  chain over real HTTP, cookies, CORS and rate limiting included, rather
 *  than calling handlers directly and missing the parts that carry the security
 *  model. */
export async function startTestServer(): Promise<TestServer> {
  const app = createApp();

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port assigned");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

/** Minimal cookie jar: the browser does this for us in production, but fetch
 *  does not, and the entire auth design depends on cookies travelling. */
export class CookieJar {
  private jar = new Map<string, string>();

  capture(res: Response) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const idx = pair?.indexOf("=") ?? -1;
      if (!pair || idx < 0) continue;
      const name = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      if (value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  get(name: string): string | undefined {
    return this.jar.get(name);
  }
}

// ---- Typed response reading -------------------------------------------------
// res.json() is `unknown` under strict TypeScript. Rather than scatter casts (or
// `any`) through the specs, the response contract is declared once here, which
// also means a change to the DTO shape surfaces as a compile error in the tests.

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  createdAt: string;
}

export interface OrgDTO {
  id: string;
  name: string;
  confidenceThreshold: number;
  maxPriceDeltaPct: number;
  createdAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
}

export interface ApiEnvelope {
  success: boolean;
  data?: { user?: UserDTO; organization?: OrgDTO; message?: string };
  error?: ApiError;
}

export async function readJson(res: Response): Promise<ApiEnvelope> {
  return (await res.json()) as ApiEnvelope;
}
