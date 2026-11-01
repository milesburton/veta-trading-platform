import { checkRisk } from "#veta/risk-client";
import { type CheckRequest, CheckRequestSchema } from "#veta/schemas/risk";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";

const REQ: CheckRequest = {
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
    Promise.resolve(new Response(JSON.stringify(response), { status }))) as unknown as typeof fetch;
}

test("[risk-client] allowed response passes through reasons/warnings", async () => {
  const result = await checkRisk(
    "http://risk",
    REQ,
    fakeFetch({ allowed: true, reasons: [], warnings: ["fyi"] })
  );
  assertEquals(result.allowed, true);
  assertEquals(result.warnings, ["fyi"]);
});

test("[risk-client] disallowed response surfaces reasons", async () => {
  const result = await checkRisk(
    "http://risk",
    REQ,
    fakeFetch({ allowed: false, reasons: ["FAT_FINGER"], warnings: [] })
  );
  assertEquals(result.allowed, false);
  assertEquals(result.reasons, ["FAT_FINGER"]);
});

test("[risk-client] fails closed on a non-2xx response", async () => {
  const result = await checkRisk("http://risk", REQ, fakeFetch({}, 500));
  assertEquals(result.allowed, false);
  assertEquals(result.reasons.length > 0, true);
});

test("[risk-client] fails closed on a malformed response body", async () => {
  const result = await checkRisk("http://risk", REQ, fakeFetch({ notAllowed: true }));
  assertEquals(result.allowed, false);
});

test("[risk-client] fails closed when the fetch throws (network/timeout)", async () => {
  const throwingFetch = (() =>
    Promise.reject(new Error("connection refused"))) as unknown as typeof fetch;
  const result = await checkRisk("http://risk", REQ, throwingFetch);
  assertEquals(result.allowed, false);
  assertEquals(
    result.reasons[0].includes("unavailable"),
    true,
    `expected an unavailable-style reason, got: ${JSON.stringify(result.reasons)}`
  );
});

const HOSTILE_RESPONSES: Array<[string, unknown, number]> = [
  ["a string allowed flag", { allowed: "yes", reasons: [], warnings: [] }, 200],
  ["a numeric allowed flag", { allowed: 1, reasons: [], warnings: [] }, 200],
  ["missing reasons", { allowed: true, warnings: [] }, 200],
  ["missing warnings", { allowed: true, reasons: [] }, 200],
  ["non-array reasons", { allowed: false, reasons: "no", warnings: [] }, 200],
  ["a null body", null, 200],
  ["an array body", [], 200],
  ["an allowed body on a 500", { allowed: true, reasons: [], warnings: [] }, 500],
  ["an allowed body on a 400", { allowed: true, reasons: [], warnings: [] }, 400],
];

for (const [label, body, status] of HOSTILE_RESPONSES) {
  test(`[risk-client] blocks the order on ${label}`, async () => {
    const result = await checkRisk("http://risk", REQ, fakeFetch(body, status));
    assertEquals(result.allowed, false);
    assertEquals(result.reasons.length > 0, true);
  });
}

test("[risk-client] blocks the order on an unparseable body", async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response("<html>", { status: 200 }))) as unknown as typeof fetch;
  assertEquals((await checkRisk("http://risk", REQ, fetchImpl)).allowed, false);
});

test("[risk-client] blocks the order when the request times out or the network fails", async () => {
  const failing = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
  assertEquals((await checkRisk("http://risk", REQ, failing)).allowed, false);
});

test("[risk-client] ignores extra fields the engine adds to the response", async () => {
  const result = await checkRisk(
    "http://risk",
    REQ,
    fakeFetch({ allowed: true, reasons: [], warnings: [], riskConfigVersion: 7 })
  );
  assertEquals(result, { allowed: true, reasons: [], warnings: [] });
});

test("[risk-client] posts a body that satisfies the engine's request schema", async () => {
  let sent: unknown;
  const capture = ((_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Promise.resolve(
      new Response(JSON.stringify({ allowed: true, reasons: [], warnings: [] }))
    );
  }) as unknown as typeof fetch;
  await checkRisk("http://risk", REQ, capture);
  assertEquals(CheckRequestSchema.safeParse(sent).success, true);
});
