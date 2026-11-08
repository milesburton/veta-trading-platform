import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { toAuditEvent } from "../journal/audit-ingest.ts";
import { buildRegisterAuditEvent } from "../user-service/account-audit.ts";

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
