import { assertEquals } from "jsr:@std/assert@0.217";
import { CxlRejReason, CxlRejResponseTo, MsgType, Tag } from "../fix/fix-dictionary.ts";

Deno.test("[fix-dictionary] OrderCancelReplaceRequest is MsgType G, per FIX 4.4", () => {
  assertEquals(MsgType.OrderCancelReplaceRequest, "G");
});

Deno.test("[fix-dictionary] OrderCancelRequest and OrderCancelReject retain their FIX 4.4 values", () => {
  assertEquals(MsgType.OrderCancelRequest, "F");
  assertEquals(MsgType.OrderCancelReject, "9");
});

Deno.test("[fix-dictionary] OrigClOrdID is tag 41, per FIX 4.4", () => {
  assertEquals(Tag.OrigClOrdID, 41);
});

Deno.test("[fix-dictionary] CxlRejResponseTo distinguishes cancel vs cancel-replace", () => {
  assertEquals(CxlRejResponseTo.OrderCancelRequest, "1");
  assertEquals(CxlRejResponseTo.OrderCancelReplaceRequest, "2");
});

Deno.test("[fix-dictionary] CxlRejReason has distinct values", () => {
  const values = Object.values(CxlRejReason);
  assertEquals(new Set(values).size, values.length);
});
