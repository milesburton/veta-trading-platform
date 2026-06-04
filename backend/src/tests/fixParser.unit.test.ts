import { assertEquals } from "jsr:@std/assert@0.217";
import { decode, encode, utcTimestamp, validateChecksum } from "../fix/fix-parser.ts";

Deno.test("[fix-parser] encode/decode round trip", () => {
  const raw = encode([
    [35, "D"],
    [49, "SENDER"],
    [56, "TARGET"],
    [55, "MSFT"],
    [54, 1],
    [38, 100],
    [44, 100],
  ]);
  const decoded = decode(raw);

  assertEquals(decoded.get(8), "FIX.4.4");
  assertEquals(decoded.get(35), "D");
  assertEquals(decoded.get(55), "MSFT");
  assertEquals(validateChecksum(raw), true);
});

Deno.test("[fix-parser] utcTimestamp uses FIX format", () => {
  assertEquals(utcTimestamp(new Date("2023-01-01T00:00:00.123Z")), "20230101-00:00:00.123");
});
