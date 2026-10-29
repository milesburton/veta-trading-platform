import { readFile, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { AUTH_ROLES } from "../../../frontend/src/auth/rbac.ts";
import {
  asRole,
  discoverCandidatePaths,
  GATEWAY_SOURCE,
  HANDLERS,
  METHODS,
  makeProbeContext,
  probeRequest,
  ROUTES_DIR,
} from "./gateway-route-probe.ts";

type Access = "all" | string[];

interface RoleMatrix {
  routes: Record<string, Access>;
  proxy: Record<string, Access>;
}

const MATRIX_FILE = new URL("./fixtures/gateway-role-matrix.json", import.meta.url);
const REGENERATE = process.env.UPDATE_ROLE_MATRIX === "1";
const MIN_MATRIX_ROUTES = 95;
const MIN_PROXY_SERVICES = 30;

function summarise(allowed: string[]): Access {
  const sorted = AUTH_ROLES.filter((r) => allowed.includes(r)).sort();
  return sorted.length === AUTH_ROLES.length ? "all" : sorted;
}

async function probeRouteMatrix(): Promise<Record<string, Access>> {
  const routes: Record<string, Access> = {};
  for (const [file, handler] of Object.entries(HANDLERS)) {
    const source = await readFile(new URL(file, ROUTES_DIR), "utf8");
    for (const path of discoverCandidatePaths(source)) {
      for (const method of METHODS) {
        const allowed: string[] = [];
        let authChecked = false;
        let handled = false;
        for (const role of AUTH_ROLES) {
          const ctx = makeProbeContext(
            () => asRole(role),
            () => {
              authChecked = true;
            }
          );
          let status: number | null = null;
          try {
            const res = (await handler(probeRequest(method, path), path, ctx)) as Response | null;
            handled = handled || res !== null;
            status = res === null ? null : res.status;
          } catch {
            handled = true;
          }
          if (status !== 403) allowed.push(role);
        }
        if (handled && authChecked) routes[`${method} ${path}`] = summarise(allowed);
      }
    }
  }
  return Object.fromEntries(Object.entries(routes).sort(([a], [b]) => a.localeCompare(b)));
}

async function readProxyMatrix(): Promise<Record<string, Access>> {
  const source = await readFile(GATEWAY_SOURCE, "utf8");
  const block = source.match(/const SVC_MIN_ROLES[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
  const entries = [...block.matchAll(/(?:"([\w-]+)"|(\w+)): new Set\(\[([^\]]*)\]\)/g)].map(
    ([, quoted, bare, roles]) =>
      [quoted ?? bare, summarise([...roles.matchAll(/"([\w-]+)"/g)].map((m) => m[1]))] as const
  );
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

async function currentMatrix(): Promise<RoleMatrix> {
  return { routes: await probeRouteMatrix(), proxy: await readProxyMatrix() };
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("network disabled in role matrix")));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("role-matrix: gateway authorisation per role matches the committed matrix", async () => {
  const actual = await currentMatrix();
  if (REGENERATE) {
    await writeFile(MATRIX_FILE, `${JSON.stringify(actual, null, 2)}\n`);
  }
  const expected = JSON.parse(await readFile(MATRIX_FILE, "utf8")) as RoleMatrix;
  assertEquals(
    actual,
    expected,
    "Role access to a gateway route changed. If intended, regenerate with UPDATE_ROLE_MATRIX=1 and review the fixture diff as a security change."
  );
});

test("role-matrix: route discovery covers a plausible number of routes", async () => {
  const { routes, proxy } = await currentMatrix();
  assertEquals(Object.keys(routes).length >= MIN_MATRIX_ROUTES, true);
  assertEquals(Object.keys(proxy).length >= MIN_PROXY_SERVICES, true);
});
