import { assert, assertEquals, assertFalse } from "jsr:@std/assert@0.217";
import { BEGIN_STRING, decode, encode, SOH, utcTimestamp, validateChecksum } from "../fix/fix-parser.ts";

Deno.test("[fix-parser] encode prepends BeginString and BodyLength, appends CheckSum", () => {
  const msg = encode([
    [35, "A"],
    [49, "EXCHANGE"],
  ]);
  assert(msg.startsWith(`8=${BEGIN_STRING}${SOH}9=`));
  assert(msg.includes(`35=A${SOH}`));
  assert(msg.includes(`49=EXCHANGE${SOH}`));
  assert(/10=\d{3}\x01$/.test(msg));
});

Deno.test("[fix-parser] BodyLength excludes BeginString/BodyLength/CheckSum fields", () => {
  const msg = encode([[35, "0"]]);
  const bodyLenMatch = msg.match(new RegExp(`9=(\\d+)${SOH}`));
  assert(bodyLenMatch);
  const declaredLen = Number(bodyLenMatch[1]);
  const bodyStart = msg.indexOf(`${SOH}`, msg.indexOf("9=")) + 1;
  const bodyEnd = msg.lastIndexOf(`${SOH}10=`) + 1;
  const actualBody = msg.slice(bodyStart, bodyEnd);
  assertEquals(new TextEncoder().encode(actualBody).length, declaredLen);
});

Deno.test("[fix-parser] decode round-trips an encoded message", () => {
  const msg = encode([
    [35, "D"],
    [11, "clOrd-1"],
    [55, "AAPL"],
    [38, 100],
  ]);
  const tags = decode(msg);
  assertEquals(tags.get(35), "D");
  assertEquals(tags.get(11), "clOrd-1");
  assertEquals(tags.get(55), "AAPL");
  assertEquals(tags.get(38), "100");
  assertEquals(tags.get(8), BEGIN_STRING);
});

Deno.test("[fix-parser] decode ignores empty segments and malformed pairs", () => {
  const tags = decode(`35=D${SOH}${SOH}garbage${SOH}11=x${SOH}`);
  assertEquals(tags.get(35), "D");
  assertEquals(tags.get(11), "x");
  assertEquals(tags.size, 2);
});

Deno.test("[fix-parser] validateChecksum accepts a correctly encoded message", () => {
  const msg = encode([
    [35, "A"],
    [49, "EXCHANGE"],
    [56, "GATEWAY"],
  ]);
  assert(validateChecksum(msg));
});

Deno.test("[fix-parser] validateChecksum rejects a tampered body", () => {
  const msg = encode([[35, "A"]]);
  const tampered = msg.replace("35=A", "35=D");
  assertFalse(validateChecksum(tampered));
});

Deno.test("[fix-parser] validateChecksum rejects a message with no CheckSum field", () => {
  assertFalse(validateChecksum(`35=A${SOH}49=EXCHANGE${SOH}`));
});

Deno.test("[fix-parser] utcTimestamp formats as YYYYMMDD-HH:MM:SS.mmm", () => {
  const d = new Date(Date.UTC(2026, 7, 15, 9, 5, 3, 42));
  assertEquals(utcTimestamp(d), "20260815-09:05:03.042");
});
