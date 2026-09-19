import type { Role } from "@pricewise/shared";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      // Optional on the type because unauthenticated routes exist. The auth
      // middleware narrows it, and requireCtx() throws if absent, so handlers
      // never need to write `req.ctx!`.
      ctx?: {
        userId: string;
        orgId: string;
        role: Role;
      };
      validated?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

export {};
