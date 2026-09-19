/// <reference types="vite/client" />

// vite/client types ImportMetaEnv with an `any` index signature, so without
// this declaration `import.meta.env.VITE_API_URL` is `any` and the `??`
// fallback in lib/api.ts is not provably a string. The build runs `tsc -b`
// before `vite build`, so it would be caught there rather than at runtime.
interface ImportMetaEnv {
  /**
   * Absolute origin of the API in production, for example
   * "https://pricewise-api.onrender.com". No trailing slash and no path,
   * because the backend mounts its routers at the root ("/auth", "/products").
   *
   * Deliberately unset in development, where the Vite proxy serves "/api" on
   * the same origin and strips the prefix before forwarding.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
