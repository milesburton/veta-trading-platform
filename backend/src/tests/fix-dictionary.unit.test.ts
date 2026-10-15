import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { CxlRejReason, CxlRejResponseTo, MsgType, Tag } from "../fix/fix-dictionary.ts";

test("[fix-dictionary] OrderCancelReplaceRequest is MsgType G, per FIX 4.4", () => {
  assertEquals(MsgType.OrderCancelReplaceRequest, "G");
});

test("[fix-dictionary] OrderCancelRequest and OrderCancelReject retain their FIX 4.4 values", () => {
  assertEquals(MsgType.OrderCancelRequest, "F");
  assertEquals(MsgType.OrderCancelReject, "9");
});

test("[fix-dictionary] OrigClOrdID is tag 41, per FIX 4.4", () => {
  assertEquals(Tag.OrigClOrdID, 41);
});

test("[fix-dictionary] CxlRejResponseTo distinguishes cancel vs cancel-replace", () => {
  assertEquals(CxlRejResponseTo.OrderCancelRequest, "1");
  assertEquals(CxlRejResponseTo.OrderCancelReplaceRequest, "2");
});

test("[fix-dictionary] CxlRejReason has distinct values", () => {
  const values = Object.values(CxlRejReason);
  assertEquals(new Set(values).size, values.length);
});
