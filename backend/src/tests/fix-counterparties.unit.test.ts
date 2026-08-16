import { assertEquals } from "jsr:@std/assert@0.217";
import { isKnownCounterparty, loadCounterparties, resolveCounterparty } from "../fix/counterparties.ts";

Deno.test("[fix-counterparties] unknown SenderCompID resolves to null / not known", () => {
  loadCounterparties("");
  assertEquals(resolveCounterparty("NOBODY"), null);
  assertEquals(isKnownCounterparty("NOBODY"), false);
});

Deno.test("[fix-counterparties] undefined SenderCompID is never known", () => {
  loadCounterparties("GATEWAY:secret1");
  assertEquals(isKnownCounterparty(undefined), false);
});

Deno.test("[fix-counterparties] parses a single entry", () => {
  loadCounterparties("GATEWAY:secret1");
  const cp = resolveCounterparty("GATEWAY");
  assertEquals(cp?.senderCompID, "GATEWAY");
  assertEquals(cp?.password, "secret1");
  assertEquals(isKnownCounterparty("GATEWAY"), true);
});

Deno.test("[fix-counterparties] parses multiple semicolon-separated entries", () => {
  loadCounterparties("GATEWAY:secret1;PARTNERX:secret2");
  assertEquals(resolveCounterparty("GATEWAY")?.password, "secret1");
  assertEquals(resolveCounterparty("PARTNERX")?.password, "secret2");
});

Deno.test("[fix-counterparties] tolerates whitespace around entries and separators", () => {
  loadCounterparties(" GATEWAY : secret1 ; PARTNERX:secret2 ");
  assertEquals(resolveCounterparty("GATEWAY")?.password, "secret1");
  assertEquals(resolveCounterparty("PARTNERX")?.password, "secret2");
});

Deno.test("[fix-counterparties] skips malformed entries (no colon, empty id, empty secret)", () => {
  loadCounterparties("nobody-here;:secret;GATEWAY:;VALID:ok");
  assertEquals(resolveCounterparty("VALID")?.password, "ok");
  assertEquals(resolveCounterparty("GATEWAY"), null);
});

Deno.test("[fix-counterparties] a password containing a colon is preserved in full", () => {
  loadCounterparties("GATEWAY:se:cret");
  assertEquals(resolveCounterparty("GATEWAY")?.password, "se:cret");
});
