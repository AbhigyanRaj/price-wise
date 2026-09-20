/**
 * Generates docs/openapi.json from docs/openapi.yaml, and checks the document
 * against the routes the server actually mounts.
 *
 * Two files rather than one because the YAML is what a human edits and reviews
 * in a diff, while most tooling, Swagger UI and Postman included, wants JSON.
 * Generating one from the other means they cannot disagree; hand-maintaining
 * both guarantees they eventually will.
 *
 * The drift check is the more valuable half. An API document is only worth
 * anything if it is true, and the way it stops being true is that someone adds
 * a route and forgets. This reads the routers themselves and compares the real
 * method-and-path set against the documented one, so CI fails on the commit
 * that introduces the drift rather than a reviewer finding it a month later.
 *
 *   bun run docs:openapi          write the JSON, report drift
 *   bun run docs:openapi --check  report only, non-zero exit on any difference
 *
 * Bun parses YAML natively, so this needs no dependency.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Router } from "express";

import authRoutes from "../routes/auth.routes";
import healthRoutes from "../routes/health.routes";
import orgRoutes from "../routes/organization.routes";
import productRoutes from "../routes/product.routes";
import recommendationRoutes from "../routes/recommendation.routes";
import auditRoutes from "../routes/audit.routes";
import mockRoutes from "../routes/mock.routes";

const ROOT = resolve(import.meta.dirname, "../../../..");
const YAML_PATH = resolve(ROOT, "docs/openapi.yaml");
const JSON_PATH = resolve(ROOT, "docs/openapi.json");

const METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/**
 * The same mounts app.ts declares, as data.
 *
 * Duplicated deliberately rather than reverse-engineered from the running app.
 * Express 5 keeps no mount path on a layer, only an opaque matcher, so reading
 * it back means depending on framework internals that a version bump can
 * silently change. Eight lines that mirror app.ts are easier to keep honest
 * than a regex over Express's guts, and the count assertion below catches the
 * one mistake this shape allows: adding a router to app.ts and not here.
 */
const MOUNTS: [prefix: string, router: Router][] = [
  ["", healthRoutes],
  ["/auth", authRoutes],
  ["/org", orgRoutes],
  ["/products", productRoutes],
  ["/recommendations", recommendationRoutes],
  ["/audit-logs", auditRoutes],
  ["/mock", mockRoutes],
];

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Every method + path the app serves, as "GET /products". */
function implementedRoutes(): Set<string> {
  const found = new Set<string>();

  for (const [prefix, router] of MOUNTS) {
    const stack = (router as unknown as { stack: RouterLayer[] }).stack;
    for (const layer of stack) {
      if (!layer.route) continue;
      // Express writes ":param"; OpenAPI writes "{param}".
      const path = (prefix + layer.route.path).replace(/:(\w+)/g, "{$1}").replace(/\/$/, "");
      for (const method of Object.keys(layer.route.methods)) {
        if (METHODS.has(method)) found.add(`${method.toUpperCase()} ${path || "/"}`);
      }
    }
  }

  return found;
}

/** Every method + path the document declares. */
function documentedRoutes(spec: Record<string, unknown>): Set<string> {
  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
  const found = new Set<string>();
  for (const [path, operations] of Object.entries(paths)) {
    for (const method of Object.keys(operations)) {
      if (METHODS.has(method)) found.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return found;
}

/** app.ts mounts one router per entry above, plus nothing else. */
function assertMountCountMatchesApp(): string | null {
  const appSource = readFileSync(resolve(import.meta.dirname, "../app.ts"), "utf8");
  const mounted = appSource.match(/app\.use\((?:"[^"]*",\s*)?(?:[\w]+,\s*)*\w*Routes\)/g) ?? [];
  if (mounted.length !== MOUNTS.length) {
    return `app.ts mounts ${mounted.length} routers but MOUNTS lists ${MOUNTS.length}. Update this script.`;
  }
  return null;
}

function main(): void {
  const checkOnly = process.argv.includes("--check");
  const yaml = readFileSync(YAML_PATH, "utf8");
  const spec = Bun.YAML.parse(yaml) as Record<string, unknown>;

  const mountDrift = assertMountCountMatchesApp();
  if (mountDrift) console.error("  " + mountDrift);

  const implemented = implementedRoutes();
  const documented = documentedRoutes(spec);

  const undocumented = [...implemented].filter((r) => !documented.has(r)).sort();
  const phantom = [...documented].filter((r) => !implemented.has(r)).sort();

  for (const route of undocumented) console.error(`  undocumented  ${route}`);
  for (const route of phantom) console.error(`  not implemented  ${route}`);

  const json = JSON.stringify(spec, null, 2) + "\n";

  if (checkOnly) {
    const current = (() => {
      try {
        return readFileSync(JSON_PATH, "utf8");
      } catch {
        return null;
      }
    })();
    if (current !== json) {
      console.error("docs/openapi.json is stale. Run: bun run docs:openapi");
    }
    if (undocumented.length || phantom.length || mountDrift || current !== json) process.exit(1);
    console.log(`openapi.yaml matches all ${implemented.size} routes, and the JSON is current.`);
    return;
  }

  writeFileSync(JSON_PATH, json);
  console.log(`wrote docs/openapi.json (${documented.size} operations)`);
  if (undocumented.length || phantom.length || mountDrift) process.exit(1);
  console.log(`matches all ${implemented.size} implemented routes.`);
}

main();
