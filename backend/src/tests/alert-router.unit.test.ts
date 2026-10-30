import { existsSync } from "node:fs";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import {
  createAlertRouter,
  createRejectionWatch,
  createServiceWatch,
  formatAlert,
  runbookFileFor,
  runbookUrlFor,
  routeKillSwitchEvent,
} from "../gateway/alert-router.ts";
import type { ServiceStatusEntry } from "../gateway/service-status.ts";

function harness(repeatMs = 1_000) {
  const sent: string[] = [];
  const clock = { t: 1_000_000 };
  const router = createAlertRouter({
    deliver: (text) => {
      sent.push(text);
      return Promise.resolve();
    },
    now: () => clock.t,
    repeatMs,
  });
  return { sent, clock, router };
}

function entry(id: string, status: ServiceStatusEntry["status"], optional = false) {
  return { id, name: id.toUpperCase(), status, optional } as ServiceStatusEntry;
}

test("[alert-router] formats severity, title and detail", () => {
  assertEquals(
    formatAlert({ key: "k", severity: "CRITICAL", title: "OMS is offline", detail: "6 checks" }),
    "🚨 **CRITICAL** OMS is offline\n> 6 checks"
  );
  assertEquals(
    formatAlert({ key: "k", severity: "INFO", title: "Recovered" }),
    "ℹ️ **INFO** Recovered"
  );
});

test("[alert-router] raise de-duplicates until the repeat interval elapses", () => {
  const { sent, clock, router } = harness(1_000);
  const alert = { key: "a", severity: "WARNING", title: "t" } as const;
  router.raise(alert);
  router.raise(alert);
  assertEquals(sent.length, 1);
  clock.t += 1_001;
  router.raise(alert);
  assertEquals(sent.length, 2);
});

test("[alert-router] resolve only announces recovery for an active alert", () => {
  const { sent, router } = harness();
  router.resolve("a", "thing is fine");
  assertEquals(sent.length, 0);
  router.raise({ key: "a", severity: "WARNING", title: "t" });
  assert(router.isActive("a"));
  router.resolve("a", "thing is fine");
  assertEquals(sent.length, 2);
  assert(sent[1].includes("Recovered: thing is fine"));
  assert(!router.isActive("a"));
});

test("[alert-router] a failing delivery never throws into the caller", async () => {
  const router = createAlertRouter({ deliver: () => Promise.reject(new Error("webhook down")) });
  router.raise({ key: "a", severity: "WARNING", title: "t" });
  router.notify({ key: "b", severity: "INFO", title: "t" });
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("[service-watch] alerts only after consecutive failures and announces recovery", () => {
  const { sent, router } = harness();
  const watch = createServiceWatch(router, 3);
  watch.observe([entry("oms", "error")]);
  watch.observe([entry("oms", "error")]);
  assertEquals(sent.length, 0);
  watch.observe([entry("oms", "error")]);
  assertEquals(sent.length, 1);
  assert(sent[0].includes("OMS is offline"));
  watch.observe([entry("oms", "ok")]);
  assertEquals(sent.length, 2);
  assert(sent[1].includes("OMS is healthy again"));
});

test("[service-watch] a recovered blip resets the failure count", () => {
  const { sent, router } = harness();
  const watch = createServiceWatch(router, 3);
  watch.observe([entry("oms", "error")]);
  watch.observe([entry("oms", "error")]);
  watch.observe([entry("oms", "ok")]);
  watch.observe([entry("oms", "error")]);
  watch.observe([entry("oms", "error")]);
  assertEquals(sent.length, 0);
});

test("[service-watch] ignores optional services and treats starting as not offline", () => {
  const { sent, router } = harness();
  const watch = createServiceWatch(router, 1);
  watch.observe([entry("gpu", "error", true), entry("api", "starting")]);
  assertEquals(sent.length, 0);
});

test("[service-watch] stays quiet during the startup grace period", () => {
  const { sent, clock, router } = harness();
  const watch = createServiceWatch(router, 1, 60_000, () => clock.t);
  watch.observe([entry("oms", "error")]);
  assertEquals(sent.length, 0);
  clock.t += 60_000;
  watch.observe([entry("oms", "error")]);
  assertEquals(sent.length, 1);
});

test("[rejection-watch] alerts at the threshold with the top reason, then recovers", () => {
  const { sent, clock, router } = harness();
  const watch = createRejectionWatch(router, 60_000, 3, () => clock.t);
  watch.record({ reason: "limit breached" });
  watch.record({ reason: "limit breached" });
  assertEquals(sent.length, 0);
  watch.record({ reason: "desk blocked" });
  assertEquals(sent.length, 1);
  assert(sent[0].includes("3 order rejections in the last 60s"));
  assert(sent[0].includes("limit breached (2)"));

  clock.t += 61_000;
  watch.evaluate();
  assertEquals(sent.length, 2);
  assert(sent[1].includes("Recovered"));
});

test("[rejection-watch] events outside the window do not count", () => {
  const { sent, clock, router } = harness();
  const watch = createRejectionWatch(router, 10_000, 2, () => clock.t);
  watch.record({ reason: "a" });
  clock.t += 11_000;
  watch.record({ reason: "b" });
  assertEquals(sent.length, 0);
});

const KILL_AUDIT = {
  scope: "user",
  targetUserId: "u-9",
  issuedBy: "admin-1",
  issuedByRole: "admin",
  cancelledCount: 4,
  cancelledIds: ["a", "b", "c", "d"],
  ts: 1,
};

test("[kill-switch] kill audit events are delivered immediately with who and how many", () => {
  const { sent, router } = harness();
  routeKillSwitchEvent(router, "orders.kill.audit", KILL_AUDIT);
  routeKillSwitchEvent(router, "orders.kill.audit", KILL_AUDIT);
  assertEquals(sent.length, 2);
  assert(sent[0].includes("CRITICAL"));
  assert(sent[0].includes("Kill switch engaged: user u-9"));
  assert(sent[0].includes("admin-1 (admin); 4 orders cancelled"));
});

test("[kill-switch] resume audit events are announced as info", () => {
  const { sent, router } = harness();
  routeKillSwitchEvent(router, "orders.resume.audit", {
    scope: "all",
    issuedBy: "admin-1",
    issuedByRole: "admin",
    resumeAt: 5,
    ts: 5,
  });
  assertEquals(sent.length, 1);
  assert(sent[0].includes("INFO"));
  assert(sent[0].includes("Trading resumed: all"));
});

test("[kill-switch] malformed or unrelated events are ignored", () => {
  const { sent, router } = harness();
  routeKillSwitchEvent(router, "orders.kill.audit", { nonsense: true });
  routeKillSwitchEvent(router, "orders.resume.audit", null);
  routeKillSwitchEvent(router, "orders.filled", KILL_AUDIT);
  assertEquals(sent.length, 0);
});

const RUNBOOK_DIR = new URL("../../../docs/incidents/runbooks/", import.meta.url);

test("[runbooks] every alert key maps to a runbook file that exists", () => {
  for (const key of ["service:oms", "kill-switch", "order-rejections"]) {
    const file = runbookFileFor(key);
    assert(file !== null, `no runbook mapped for ${key}`);
    assert(existsSync(new URL(file, RUNBOOK_DIR)), `runbook file missing: ${file}`);
  }
  assertEquals(runbookFileFor("something-else"), null);
});

test("[runbooks] the base URL can be overridden", () => {
  assertEquals(
    runbookUrlFor("kill-switch", "https://docs.example/rb/"),
    "https://docs.example/rb/kill-switch.md"
  );
});

test("[runbooks] critical and warning alerts link a runbook, recoveries do not", () => {
  const { sent, router } = harness();
  const services = createServiceWatch(router, 1);
  services.observe([entry("oms", "error")]);
  const rejections = createRejectionWatch(router, 60_000, 1);
  rejections.record({ reason: "x" });
  routeKillSwitchEvent(router, "orders.kill.audit", KILL_AUDIT);
  routeKillSwitchEvent(router, "orders.resume.audit", {
    scope: "all",
    issuedBy: "a",
    issuedByRole: "admin",
    resumeAt: 1,
    ts: 1,
  });
  services.observe([entry("oms", "ok")]);

  const [offline, spike, kill, resume, recovered] = sent;
  assert(offline.includes("/service-offline.md"));
  assert(spike.includes("/order-rejection-spike.md"));
  assert(kill.includes("/kill-switch.md"));
  assert(!resume.includes("Runbook:"));
  assert(!recovered.includes("Runbook:"));
});
