import { assertEquals } from "jsr:@std/assert@0.217";
import {
  checkSellSideActor,
  checkSellSideTransition,
  computeMarkupPrice,
} from "../rfq/sellside-transitions.ts";

// ── checkSellSideTransition ──────────────────────────────────────────────────

Deno.test("[rfq-sellside] route is only allowed from CLIENT_REQUEST", () => {
  assertEquals(checkSellSideTransition("route", "CLIENT_REQUEST").ok, true);
  const rejected = checkSellSideTransition("route", "SALES_MARKUP");
  assertEquals(rejected.ok, false);
});

Deno.test("[rfq-sellside] markup is only allowed from SALES_MARKUP", () => {
  assertEquals(checkSellSideTransition("markup", "SALES_MARKUP").ok, true);
  assertEquals(checkSellSideTransition("markup", "CLIENT_REQUEST").ok, false);
});

Deno.test("[rfq-sellside] confirm is only allowed from CLIENT_CONFIRMATION", () => {
  assertEquals(checkSellSideTransition("confirm", "CLIENT_CONFIRMATION").ok, true);
  assertEquals(checkSellSideTransition("confirm", "SALES_MARKUP").ok, false);
});

Deno.test("[rfq-sellside] reject is blocked from CONFIRMED and REJECTED, allowed from everything else", () => {
  assertEquals(checkSellSideTransition("reject", "CONFIRMED").ok, false);
  assertEquals(checkSellSideTransition("reject", "REJECTED").ok, false);
  assertEquals(checkSellSideTransition("reject", "CLIENT_REQUEST").ok, true);
  assertEquals(checkSellSideTransition("reject", "SALES_MARKUP").ok, true);
  assertEquals(checkSellSideTransition("reject", "CLIENT_CONFIRMATION").ok, true);
});

Deno.test("[rfq-sellside] a rejected transition returns a 409 status and a descriptive error", () => {
  const result = checkSellSideTransition("confirm", "CLIENT_REQUEST");
  if (result.ok) throw new Error("expected rejection");
  assertEquals(result.status, 409);
  assertEquals(result.error.includes("CLIENT_REQUEST"), true);
});

// ── checkSellSideActor ───────────────────────────────────────────────────────

Deno.test("[rfq-sellside] markup requires the acting salesUserId to match the assigned rep", () => {
  assertEquals(checkSellSideActor("markup", "sales1", { salesUserId: "sales1" }).ok, true);
  const mismatch = checkSellSideActor("markup", "sales2", { salesUserId: "sales1" });
  assertEquals(mismatch.ok, false);
  if (!mismatch.ok) assertEquals(mismatch.status, 403);
});

Deno.test("[rfq-sellside] markup with no actor id at all is rejected", () => {
  assertEquals(checkSellSideActor("markup", undefined, { salesUserId: "sales1" }).ok, false);
});

Deno.test("[rfq-sellside] confirm requires the acting clientUserId to match the RFQ's client", () => {
  assertEquals(checkSellSideActor("confirm", "client1", { clientUserId: "client1" }).ok, true);
  assertEquals(checkSellSideActor("confirm", "client2", { clientUserId: "client1" }).ok, false);
});

Deno.test("[rfq-sellside] route and reject have no actor check", () => {
  assertEquals(checkSellSideActor("route", undefined, {}).ok, true);
  assertEquals(checkSellSideActor("reject", undefined, {}).ok, true);
});

// ── computeMarkupPrice ───────────────────────────────────────────────────────

Deno.test("[rfq-sellside] a client BUY marks the dealer price up", () => {
  const price = computeMarkupPrice(100, "BUY", 50); // 50bps = 0.5%
  assertEquals(price, 100.5);
});

Deno.test("[rfq-sellside] a client SELL marks the dealer price down", () => {
  const price = computeMarkupPrice(100, "SELL", 50);
  assertEquals(price, 99.5);
});

Deno.test("[rfq-sellside] zero markup leaves the dealer price unchanged", () => {
  assertEquals(computeMarkupPrice(100, "BUY", 0), 100);
  assertEquals(computeMarkupPrice(100, "SELL", 0), 100);
});
