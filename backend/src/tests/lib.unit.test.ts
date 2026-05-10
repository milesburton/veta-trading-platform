import { assertEquals } from "jsr:@std/assert@0.217";
import { getCookieToken } from "../lib/auth.ts";
import { settlementDate } from "../lib/settlement.ts";

Deno.test("[lib/auth] getCookieToken returns token from veta_user cookie", () => {
  const req = new Request("https://veta.test", {
    headers: { cookie: "veta_user=abc123" },
  });
  assertEquals(getCookieToken(req), "abc123");
});

Deno.test("[lib/auth] getCookieToken returns null when no cookie header", () => {
  assertEquals(getCookieToken(new Request("https://veta.test")), null);
});

Deno.test("[lib/auth] getCookieToken returns null when veta_user is missing among other cookies", () => {
  const req = new Request("https://veta.test", {
    headers: { cookie: "other=foo; another=bar" },
  });
  assertEquals(getCookieToken(req), null);
});

Deno.test("[lib/auth] getCookieToken extracts veta_user when other cookies are present", () => {
  const req = new Request("https://veta.test", {
    headers: { cookie: "session=x; veta_user=tok-9; tracking=y" },
  });
  assertEquals(getCookieToken(req), "tok-9");
});

Deno.test("[lib/auth] getCookieToken stops at the next semicolon (no greedy match)", () => {
  const req = new Request("https://veta.test", {
    headers: { cookie: "veta_user=tok;extra=bar" },
  });
  assertEquals(getCookieToken(req), "tok");
});

const monday = Date.UTC(2026, 4, 11);
const friday = Date.UTC(2026, 4, 8);
const wednesday = Date.UTC(2026, 4, 6);

Deno.test("[lib/settlement] equity (T+2): Monday → Wednesday", () => {
  assertEquals(settlementDate("equity", monday), "2026-05-13");
});

Deno.test("[lib/settlement] equity (T+2): Friday → Tuesday (skips weekend)", () => {
  assertEquals(settlementDate("equity", friday), "2026-05-12");
});

Deno.test("[lib/settlement] fi (T+1): Wednesday → Thursday", () => {
  assertEquals(settlementDate("fi", wednesday), "2026-05-07");
});

Deno.test("[lib/settlement] fi (T+1): Friday → Monday (skips weekend)", () => {
  assertEquals(settlementDate("fi", friday), "2026-05-11");
});

Deno.test("[lib/settlement] derivatives (T+1) matches fi behaviour", () => {
  assertEquals(settlementDate("derivatives", friday), "2026-05-11");
});

Deno.test("[lib/settlement] fx (T+2) matches equity behaviour", () => {
  assertEquals(settlementDate("fx", friday), "2026-05-12");
});

Deno.test("[lib/settlement] commodities (T+2)", () => {
  assertEquals(settlementDate("commodities", friday), "2026-05-12");
});

Deno.test("[lib/settlement] default desk is equity", () => {
  assertEquals(settlementDate(undefined, monday), "2026-05-13");
});
