import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import type { GatewayContext } from "../gateway/context.ts";

const h = vi.hoisted(() => ({
  auditStatus: 200,
  omsHealth: null as Response | null,
  requested: [] as string[],
}));

vi.mock("../lib/db.ts", () => {
  const pool = (rows: unknown[]) => ({
    connect: () =>
      Promise.resolve({
        queryObject: () => Promise.resolve({ rows }),
        release: () => undefined,
      }),
  });
  return {
    scenariosPool: pool([
      {
        algo_id: "VETA-TWAP",
        status: "passed",
        triggered_at: new Date(5),
        algo_version: "1.0.0",
        commit_sha: "abc",
      },
    ]),
    riskPool: pool([{ id: 9n, created_at: new Date(0), created_by: "admin" }]),
  };
});

const { handleComplianceRoute } = await import("../gateway/routes/compliance.ts");

function context(role: string | null): GatewayContext {
  return {
    urls: { journal: "http://journal", omsUrl: "http://oms" },
    requireAuth: () =>
      Promise.resolve(
        role === null
          ? new Response("{}", { status: 401 })
          : { user: { id: "u", name: "T", role, avatar_emoji: "x" }, limits: {} }
      ),
  } as unknown as GatewayContext;
}

const call = (role: string | null, method = "GET", path = "/compliance/algo-controls") =>
  handleComplianceRoute(new Request(`http://gw${path}`, { method }), path, context(role));

beforeEach(() => {
  h.auditStatus = 200;
  h.omsHealth = new Response(JSON.stringify({ status: "ok", riskEngineEnabled: false }));
  h.requested = [];
  vi.stubGlobal("fetch", (input: string | URL | Request) => {
    const url = String(input);
    h.requested.push(url);
    if (url.startsWith("http://oms")) {
      return h.omsHealth ? Promise.resolve(h.omsHealth) : Promise.reject(new Error("down"));
    }
    return Promise.resolve(
      new Response(
        JSON.stringify([{ action: "orders_kill", actorId: "a", target: "global", ts: 7 }]),
        { status: h.auditStatus }
      )
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("[compliance] ignores other paths and methods", async () => {
  assertEquals(await call("admin", "GET", "/other"), null);
  assertEquals(await call("admin", "POST"), null);
});

test("[compliance] requires authentication and the admin or compliance role", async () => {
  assertEquals((await call(null))?.status, 401);
  assertEquals((await call("trader"))?.status, 403);
});

test("[compliance] assembles the algo controls report for compliance", async () => {
  const res = await call("compliance");
  assertEquals(res?.status, 200);
  const body = await res?.json();
  assertEquals(body.riskConfig.id, 9);
  assertEquals(body.killSwitchHistory.length, 1);
  assertEquals(
    body.algorithms.find((a: { algoId: string }) => a.algoId === "VETA-TWAP").lastScenarioRun
      .status,
    "passed"
  );
});

test("[compliance] reports the OMS's effective risk setting and asks the audit log for kill actions only", async () => {
  const body = await (await call("admin"))?.json();
  assertEquals(body.riskEngineEnabled, false);
  const auditUrl = h.requested.find((u) => u.startsWith("http://journal/audit")) ?? "";
  assertEquals(new URL(auditUrl).searchParams.get("action"), "orders_kill,orders_resume");
});

test("[compliance] reports the risk engine state as unknown when the OMS cannot be reached", async () => {
  h.omsHealth = null;
  const res = await call("admin");
  assert(res);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).riskEngineEnabled, null);
});

test("[compliance] returns 502 when an upstream source fails", async () => {
  h.auditStatus = 500;
  assertEquals((await call("admin"))?.status, 502);
});
