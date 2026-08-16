import { assertEquals } from "jsr:@std/assert@0.217";
import { isMarketOpenForOrderEntry } from "../fix/fix-market-session.ts";

Deno.test("[fix-market-session] rejects HALTED", () => {
  assertEquals(isMarketOpenForOrderEntry("HALTED"), false);
});

Deno.test("[fix-market-session] rejects CLOSED", () => {
  assertEquals(isMarketOpenForOrderEntry("CLOSED"), false);
});

Deno.test("[fix-market-session] allows PRE_OPEN, OPENING_AUCTION, CONTINUOUS, CLOSING_AUCTION", () => {
  assertEquals(isMarketOpenForOrderEntry("PRE_OPEN"), true);
  assertEquals(isMarketOpenForOrderEntry("OPENING_AUCTION"), true);
  assertEquals(isMarketOpenForOrderEntry("CONTINUOUS"), true);
  assertEquals(isMarketOpenForOrderEntry("CLOSING_AUCTION"), true);
});

Deno.test("[fix-market-session] treats an undefined phase (no tick yet) as open", () => {
  assertEquals(isMarketOpenForOrderEntry(undefined), true);
});
