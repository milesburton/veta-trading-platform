import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { isKnownCounterparty, loadCounterparties, resolveCounterparty } from "../fix/counterparties.ts";

test("[fix-counterparties] unknown SenderCompID resolves to null / not known", () => {
  loadCounterparties("");
  assertEquals(resolveCounterparty("NOBODY"), null);
  assertEquals(isKnownCounterparty("NOBODY"), false);
});

test("[fix-counterparties] undefined SenderCompID is never known", () => {
  loadCounterparties("GATEWAY:secret1");
  assertEquals(isKnownCounterparty(undefined), false);
});

test("[fix-counterparties] parses a single entry", () => {
  loadCounterparties("GATEWAY:secret1");
  const cp = resolveCounterparty("GATEWAY");
  assertEquals(cp?.senderCompID, "GATEWAY");
  assertEquals(cp?.password, "secret1");
  assertEquals(isKnownCounterparty("GATEWAY"), true);
});

test("[fix-counterparties] parses multiple semicolon-separated entries", () => {
  loadCounterparties("GATEWAY:secret1;PARTNERX:secret2");
  assertEquals(resolveCounterparty("GATEWAY")?.password, "secret1");
  assertEquals(resolveCounterparty("PARTNERX")?.password, "secret2");
});

test("[fix-counterparties] tolerates whitespace around entries and separators", () => {
  loadCounterparties(" GATEWAY : secret1 ; PARTNERX:secret2 ");
  assertEquals(resolveCounterparty("GATEWAY")?.password, "secret1");
  assertEquals(resolveCounterparty("PARTNERX")?.password, "secret2");
});

test("[fix-counterparties] skips malformed entries (no colon, empty id, empty secret)", () => {
  loadCounterparties("nobody-here;:secret;GATEWAY:;VALID:ok");
  assertEquals(resolveCounterparty("VALID")?.password, "ok");
  assertEquals(resolveCounterparty("GATEWAY"), null);
});

test("[fix-counterparties] a password containing a colon is preserved in full", () => {
  loadCounterparties("GATEWAY:se:cret");
  assertEquals(resolveCounterparty("GATEWAY")?.password, "se:cret");
});
