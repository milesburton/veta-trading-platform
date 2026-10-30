import { readFile } from "node:fs/promises";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import type { AuthResult, GatewayContext } from "../gateway/context.ts";
import { classifyPrivileged, PRIVILEGED_RULES, runWithAudit } from "../gateway/privileged-audit.ts";
import { AUDIT_TOPICS, toAuditEvent } from "../journal/audit-ingest.ts";
import type { AuditEvent } from "../lib/audit.ts";

const ADMIN: AuthResult = {
  user: { id: "admin-1", name: "Admin", role: "admin", avatar_emoji: "" },
  limits: { max_order_qty: 1, max_daily_notional: 1, allowed_strategies: [] },
};

function context(auth: AuthResult | Response): GatewayContext {
  return { requireAuth: () => Promise.resolve(auth) } as unknown as GatewayContext;
}

function collector() {
  const events: AuditEvent[] = [];
  return { events, publish: (e: AuditEvent) => void events.push(e) };
}

test("[privileged-audit] classifies privileged mutations and ignores reads", () => {
  assertEquals(classifyPrivileged("PUT", "/admin/market-hours"), "market_hours_update");
  assertEquals(classifyPrivileged("POST", "/load-gen/start"), "load_gen_control");
  assertEquals(classifyPrivileged("PUT", "/market-data/overrides"), "market_data_override_update");
  assertEquals(classifyPrivileged("POST", "/api/market-sim/admin/reset"), "market_sim_admin");
  assertEquals(classifyPrivileged("PUT", "/api/risk-engine/config"), "risk_engine_change");
  assertEquals(classifyPrivileged("GET", "/admin/market-hours"), null);
  assertEquals(classifyPrivileged("GET", "/api/risk-engine/positions/u-1"), null);
  assertEquals(classifyPrivileged("PUT", "/preferences"), null);
});

test("[privileged-audit] every rule has a distinct action name", () => {
  const actions = PRIVILEGED_RULES.map((r) => r.action);
  assertEquals(new Set(actions).size, actions.length);
});

test("[privileged-audit] publishes an event for a successful privileged call", async () => {
  const { events, publish } = collector();
  const req = new Request("http://gw/admin/market-hours", { method: "PUT" });
  const res = await runWithAudit(req, "/admin/market-hours", context(ADMIN), publish, async (c) => {
    await c.requireAuth(req);
    return new Response("{}", { status: 200 });
  });
  assertEquals(res?.status, 200);
  assertEquals(events.length, 1);
  assertEquals(events[0], {
    actorId: "admin-1",
    actorRole: "admin",
    action: "market_hours_update",
    target: "/admin/market-hours",
    detail: { method: "PUT", status: 200 },
  });
});

test("[privileged-audit] failed, denied and unauthenticated calls are not recorded", async () => {
  for (const [auth, status] of [
    [ADMIN, 403],
    [ADMIN, 502],
    [new Response("{}", { status: 401 }), 401],
  ] as const) {
    const { events, publish } = collector();
    const req = new Request("http://gw/load-test", { method: "POST" });
    await runWithAudit(req, "/load-test", context(auth), publish, async (c) => {
      await c.requireAuth(req);
      return new Response("{}", { status });
    });
    assertEquals(events.length, 0);
  }
});

test("[privileged-audit] non-privileged routes run untouched and unaudited", async () => {
  const { events, publish } = collector();
  const req = new Request("http://gw/orders", { method: "GET" });
  const res = await runWithAudit(req, "/orders", context(ADMIN), publish, async (c) => {
    await c.requireAuth(req);
    return new Response("{}", { status: 200 });
  });
  assertEquals(res?.status, 200);
  assertEquals(events.length, 0);
});

test("[privileged-audit] a null handler result passes through without an event", async () => {
  const { events, publish } = collector();
  const req = new Request("http://gw/load-test", { method: "POST" });
  const res = await runWithAudit(req, "/load-test", context(ADMIN), publish, () =>
    Promise.resolve(null)
  );
  assertEquals(res, null);
  assertEquals(events.length, 0);
});

test("[audit-ingest] maps kill and resume audit events to audit rows", () => {
  const kill = toAuditEvent("orders.kill.audit", {
    scope: "user",
    targetUserId: "u-9",
    issuedBy: "admin-1",
    issuedByRole: "admin",
    cancelledCount: 4,
    cancelledIds: [],
    ts: 1000,
  });
  assertEquals(kill?.action, "orders_kill");
  assertEquals(kill?.actorId, "admin-1");
  assertEquals(kill?.target, "user:u-9");
  assertEquals(kill?.detail?.cancelledCount, 4);

  const resume = toAuditEvent("orders.resume.audit", {
    scope: "all",
    issuedBy: "admin-1",
    issuedByRole: "admin",
    resumeAt: 5,
    ts: 5,
  });
  assertEquals(resume?.action, "orders_resume");
  assertEquals(resume?.target, "all");
});

test("[audit-ingest] accepts valid gateway audit events and rejects malformed input", () => {
  const valid = toAuditEvent("audit.events", {
    actorId: "a",
    actorRole: "admin",
    action: "market_hours_update",
  });
  assertEquals(valid?.action, "market_hours_update");
  assertEquals(toAuditEvent("audit.events", { action: "x" }), null);
  assertEquals(toAuditEvent("orders.kill.audit", { nonsense: true }), null);
  assertEquals(toAuditEvent("orders.filled", {}), null);
  assertEquals(AUDIT_TOPICS.length, 3);
});

test("[privileged-audit] the generic journal proxy restricts /audit to admin and compliance", async () => {
  const source = await readFile(new URL("../gateway/gateway.ts", import.meta.url), "utf8");
  const normalised = source.replace(/\s+/g, " ");
  assert(
    normalised.includes(
      'svcName === "journal" && svcPath.startsWith("/audit") ? new Set(["admin", "compliance"])'
    )
  );
});
