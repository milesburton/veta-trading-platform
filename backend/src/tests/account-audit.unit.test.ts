import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { toAuditEvent } from "../journal/audit-ingest.ts";
import {
  buildLimitsUpdateAuditEvent,
  buildRegisterAuditEvent,
} from "../user-service/account-audit.ts";

test("[account-audit] registration event names the new account as actor and target", () => {
  assertEquals(buildRegisterAuditEvent("alice", "momentum", 1_700_000_000_000), {
    actorId: "alice",
    actorRole: "trader",
    action: "account_register",
    target: "alice",
    detail: { archetype: "momentum" },
    ts: 1_700_000_000_000,
  });
});

test("[account-audit] registration event passes journal ingest validation", () => {
  const event = buildRegisterAuditEvent("alice", "momentum", 1_700_000_000_000);
  assertEquals(toAuditEvent("audit.events", event)?.action, "account_register");
});

const BEFORE = {
  max_order_qty: 100,
  max_daily_notional: 50_000,
  allowed_strategies: ["LIMIT"],
  allowed_desks: ["equity"],
  dark_pool_access: false,
};
const AFTER = { ...BEFORE, max_order_qty: 500, dark_pool_access: true };

test("[account-audit] limits update names the admin as actor and records before and after", () => {
  assertEquals(
    buildLimitsUpdateAuditEvent(
      { id: "admin-1", role: "admin" },
      "alice",
      BEFORE,
      AFTER,
      1_700_000_000_000
    ),
    {
      actorId: "admin-1",
      actorRole: "admin",
      action: "account_limits_update",
      target: "alice",
      detail: { before: BEFORE, after: AFTER },
      ts: 1_700_000_000_000,
    }
  );
});

test("[account-audit] limits update event passes journal ingest validation", () => {
  const event = buildLimitsUpdateAuditEvent(
    { id: "admin-1", role: "admin" },
    "alice",
    BEFORE,
    AFTER,
    1_700_000_000_000
  );
  assertEquals(toAuditEvent("audit.events", event)?.action, "account_limits_update");
});
