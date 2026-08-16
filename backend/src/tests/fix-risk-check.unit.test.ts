import { assertEquals } from "jsr:@std/assert@0.217";
import { checkRisk, type RiskCheckRequest } from "../fix/risk-check.ts";

const REQ: RiskCheckRequest = {
  orderId: "c1",
  userId: "GATEWAY",
  userRole: "trader",
  symbol: "AAPL",
  side: "BUY",
  quantity: 10,
  limitPrice: 100,
};

function fakeFetch(response: unknown, status = 200): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(response), { status })
    )) as unknown as typeof fetch;
}

Deno.test("[fix-risk-check] allowed response passes through reasons/warnings", async () => {
  const result = await checkRisk(
    "http://risk",
    REQ,
    fakeFetch({ allowed: true, reasons: [], warnings: ["fyi"] })
  );
  assertEquals(result.allowed, true);
  assertEquals(result.warnings, ["fyi"]);
});

Deno.test("[fix-risk-check] disallowed response surfaces reasons", async () => {
  const result = await checkRisk(
    "http://risk",
    REQ,
    fakeFetch({ allowed: false, reasons: ["FAT_FINGER"], warnings: [] })
  );
  assertEquals(result.allowed, false);
  assertEquals(result.reasons, ["FAT_FINGER"]);
});

Deno.test("[fix-risk-check] fails closed on a non-2xx response", async () => {
  const result = await checkRisk("http://risk", REQ, fakeFetch({}, 500));
  assertEquals(result.allowed, false);
  assertEquals(result.reasons.length > 0, true);
});

Deno.test("[fix-risk-check] fails closed on a malformed response body", async () => {
  const result = await checkRisk("http://risk", REQ, fakeFetch({ notAllowed: true }));
  assertEquals(result.allowed, false);
});

Deno.test("[fix-risk-check] fails closed when the fetch throws (network/timeout)", async () => {
  const throwingFetch = (() => Promise.reject(new Error("connection refused"))) as unknown as typeof fetch;
  const result = await checkRisk("http://risk", REQ, throwingFetch);
  assertEquals(result.allowed, false);
  assertEquals(
    result.reasons[0].includes("unavailable"),
    true,
    `expected an unavailable-style reason, got: ${JSON.stringify(result.reasons)}`
  );
});
