import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { isMarketOpenForOrderEntry } from "../fix/fix-market-session.ts";

test("[fix-market-session] rejects HALTED", () => {
  assertEquals(isMarketOpenForOrderEntry("HALTED"), false);
});

test("[fix-market-session] rejects CLOSED", () => {
  assertEquals(isMarketOpenForOrderEntry("CLOSED"), false);
});

test("[fix-market-session] allows PRE_OPEN, OPENING_AUCTION, CONTINUOUS, CLOSING_AUCTION", () => {
  assertEquals(isMarketOpenForOrderEntry("PRE_OPEN"), true);
  assertEquals(isMarketOpenForOrderEntry("OPENING_AUCTION"), true);
  assertEquals(isMarketOpenForOrderEntry("CONTINUOUS"), true);
  assertEquals(isMarketOpenForOrderEntry("CLOSING_AUCTION"), true);
});

test("[fix-market-session] treats an undefined phase (no tick yet) as open", () => {
  assertEquals(isMarketOpenForOrderEntry(undefined), true);
});
