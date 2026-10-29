import { readdir, readFile } from "node:fs/promises";
import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import {
  discoverCandidatePaths,
  GATEWAY_SOURCE,
  HANDLERS,
  METHODS,
  makeProbeContext,
  probeRequest,
  ROUTES_DIR,
  unauthenticated,
} from "./gateway-route-probe.ts";

const MIN_AUTHENTICATED_PROBES = 105;

const PUBLIC_ROUTES = new Set<string>(["GET /ws", "GET /ws/gateway"]);

const PUBLIC_INLINE_PATHS = new Set<string>([
  "/health",
  "/platform-status",
  "/services/status",
  "/ready",
  "/ws/market-sim",
]);

const EXPECTED_PUBLIC_PROXY_PREDICATE = [
  `(svcName === "user-service" &&`,
  `(svcPath.startsWith("/oauth/") ||`,
  `svcPath.startsWith("/auth/") ||`,
  `svcPath === "/personas")) ||`,
  `svcPath === "/health" ||`,
  `(svcName === "kafka-relay" && svcPath === "/events/batch" && req.method === "POST");`,
].join(" ");

beforeEach(() => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("network disabled in route inventory")));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("route-auth-inventory: every route module has a registered handler", async () => {
  const files = (await readdir(ROUTES_DIR))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();
  const unregistered = files.filter((f) => !(f in HANDLERS));
  assertEquals(
    unregistered,
    [],
    `Route modules without an entry in HANDLERS:\n  ${unregistered.join("\n  ")}\n\nAdd the handler so its routes are probed for authentication.`
  );
});

test("route-auth-inventory: every handled route authenticates or is on the public allowlist", async () => {
  const unprotected: string[] = [];
  const reachedPublic = new Set<string>();
  let authenticatedCount = 0;

  for (const [file, handler] of Object.entries(HANDLERS)) {
    const source = await readFile(new URL(file, ROUTES_DIR), "utf8");
    for (const path of discoverCandidatePaths(source)) {
      for (const method of METHODS) {
        let authChecked = false;
        const ctx = makeProbeContext(unauthenticated, () => {
          authChecked = true;
        });
        const req = probeRequest(method, path);
        let handled = true;
        try {
          handled = (await handler(req, path, ctx)) !== null;
        } catch {
          handled = true;
        }
        if (authChecked) authenticatedCount++;
        if (!handled || authChecked) continue;
        const key = `${method} ${path}`;
        if (PUBLIC_ROUTES.has(key)) reachedPublic.add(key);
        else unprotected.push(`${file}: ${key}`);
      }
    }
  }

  assertEquals(
    unprotected,
    [],
    `Routes answered an anonymous request without calling requireAuth:\n  ${unprotected.join("\n  ")}\n\nCall ctx.requireAuth first, or add the route to PUBLIC_ROUTES with a justification in the PR.`
  );
  assertEquals(
    authenticatedCount >= MIN_AUTHENTICATED_PROBES,
    true,
    `Route discovery found only ${authenticatedCount} authenticated probes; the path scanner has likely stopped matching handler source.`
  );
  assertEquals(
    [...PUBLIC_ROUTES].filter((r) => !reachedPublic.has(r)).sort(),
    [],
    "PUBLIC_ROUTES contains entries that no longer match an unauthenticated route; remove them."
  );
});

test("route-auth-inventory: inline gateway routes are authenticated or on the public allowlist", async () => {
  const source = await readFile(GATEWAY_SOURCE, "utf8");
  const blocks = source.split(/\n {2}if \(path/).slice(1);
  const exposed: string[] = [];
  const seenPublic = new Set<string>();

  for (const block of blocks) {
    const literal = block.match(/^ === "([^"]+)"/);
    if (!literal) continue;
    const body = block.split(/\n {2}\}\n/)[0];
    const authenticated = /requireAuth\(|validateToken\(/.test(body);
    if (PUBLIC_INLINE_PATHS.has(literal[1])) seenPublic.add(literal[1]);
    else if (!authenticated) exposed.push(literal[1]);
  }

  assertEquals(
    exposed,
    [],
    `Inline gateway routes without requireAuth:\n  ${exposed.join("\n  ")}\n\nAuthenticate them or add to PUBLIC_INLINE_PATHS.`
  );
  assertEquals(
    [...PUBLIC_INLINE_PATHS].filter((p) => !seenPublic.has(p)).sort(),
    [],
    "PUBLIC_INLINE_PATHS contains paths no longer present in gateway.ts; remove them."
  );
});

test("route-auth-inventory: the public service-proxy predicate is unchanged", async () => {
  const source = await readFile(GATEWAY_SOURCE, "utf8");
  const match = source.match(/const PROXY_PUBLIC =\s*([\s\S]*?;)/);
  const normalised = match ? match[1].replace(/\s+/g, " ").trim() : "";
  assertEquals(
    normalised,
    EXPECTED_PUBLIC_PROXY_PREDICATE,
    "The set of unauthenticated /api/<service> proxy paths changed. Confirm each new path is intended to be public, then update EXPECTED_PUBLIC_PROXY_PREDICATE."
  );
});
