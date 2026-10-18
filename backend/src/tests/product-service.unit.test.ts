import { beforeAll, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;

const h = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  sent: [] as Array<{ topic: string; payload: Record<string, unknown> }>,
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    h.handler = handler;
  },
}));
vi.mock("#veta/messaging", () => ({
  createProducer: () =>
    Promise.resolve({
      send: (topic: string, payload: Record<string, unknown>) => {
        h.sent.push({ topic, payload });
        return Promise.resolve();
      },
    }),
}));

async function call(method: string, path: string, body?: unknown) {
  assert(h.handler);
  return h.handler(
    new Request(`http://prod${path}`, {
      method,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

const LEGS = [
  { type: "equity", symbol: "AAPL", weight: 0.6 },
  { type: "bond", symbol: "UST10Y", weight: 0.4, isin: "US912828XX00" },
];

async function create(overrides: Record<string, unknown> = {}) {
  const res = await call("POST", "/products", {
    name: "Balanced note",
    createdBy: "u-1",
    targetNotional: 1_000_000,
    legs: LEGS,
    ...overrides,
  });
  assertEquals(res.status, 201);
  return res.json();
}

function topics() {
  return h.sent.map((s) => s.topic);
}

beforeAll(async () => {
  await import("../product-service/product-service.ts");
});

test("[product-service] serves health and preflight and rejects unknown routes", async () => {
  assertEquals((await (await call("GET", "/health")).json()).service, "product-service");
  assertEquals((await call("OPTIONS", "/products")).status, 204);
  assertEquals((await call("GET", "/nothing")).status, 404);
});

test("[product-service] validates product creation", async () => {
  assertEquals((await call("POST", "/products", "{bad")).status, 400);
  assertEquals(
    (await call("POST", "/products", { createdBy: "u", targetNotional: 1 })).status,
    400
  );
  assertEquals((await call("POST", "/products", { name: "n", targetNotional: 1 })).status, 400);
  assertEquals((await call("POST", "/products", { name: "n", createdBy: "u" })).status, 400);
  assertEquals(
    (await call("POST", "/products", { name: "n", createdBy: "u", targetNotional: 0 })).status,
    400
  );
});

test("[product-service] creates a draft product with generated ids and publishes it", async () => {
  h.sent.length = 0;
  const product = await create({ description: "d", currency: "EUR" });
  assertEquals(product.state, "draft");
  assertEquals(product.productId, "PROD000001");
  assertEquals(product.currency, "EUR");
  assertEquals(
    product.legs.map((l: { legId: string }) => l.legId),
    ["LEG0001", "LEG0002"]
  );
  assertEquals(topics(), ["products.created"]);

  const defaults = await create({ legs: undefined });
  assertEquals(defaults.currency, "USD");
  assertEquals(defaults.description, "");
  assertEquals(defaults.legs, []);
});

test("[product-service] fetches and lists products with filters", async () => {
  assertEquals((await call("GET", "/products/PROD000001")).status, 200);
  assertEquals((await call("GET", "/products/NOPE")).status, 404);

  const all = await (await call("GET", "/products")).json();
  assertEquals(all.length, 2);
  assert(all[0].createdAt >= all[1].createdAt);
  assertEquals((await (await call("GET", "/products?state=draft")).json()).length, 2);
  assertEquals((await (await call("GET", "/products?state=sold")).json()).length, 0);
  assertEquals(
    (await (await call("GET", "/products?userId=c-1&userRole=external-client")).json()).length,
    0
  );
});

test("[product-service] draft legs can be replaced until structured", async () => {
  assertEquals((await call("PUT", "/products/NOPE/legs", { legs: [] })).status, 404);
  const created = await create();
  const id = created.productId;
  assertEquals((await call("PUT", `/products/${id}/legs`, "{bad")).status, 400);

  const replaced = await (
    await call("PUT", `/products/${id}/legs`, {
      legs: [{ type: "equity", symbol: "MSFT", weight: 1 }],
    })
  ).json();
  assertEquals(replaced.legs.length, 1);
  assertEquals(replaced.legs[0].symbol, "MSFT");

  const cleared = await (await call("PUT", `/products/${id}/legs`, {})).json();
  assertEquals(cleared.legs, []);
});

test("[product-service] structuring needs legs that sum to one", async () => {
  assertEquals((await call("PUT", "/products/NOPE/structure")).status, 404);
  const empty = await create({ legs: [] });
  assertEquals((await call("PUT", `/products/${empty.productId}/structure`)).status, 400);

  const skewed = await create({ legs: [{ type: "equity", symbol: "AAPL", weight: 0.5 }] });
  const res = await call("PUT", `/products/${skewed.productId}/structure`);
  assertEquals(res.status, 400);
  assert((await res.json()).error.includes("0.5000"));
});

test("[product-service] walks a product through its whole lifecycle", async () => {
  const { productId: id } = await create();
  assertEquals((await call("PUT", `/products/${id}/issue`)).status, 400);
  assertEquals((await call("PUT", `/products/${id}/sell`)).status, 400);
  assertEquals((await call("PUT", `/products/${id}/unwind`)).status, 400);

  h.sent.length = 0;
  const structured = await (await call("PUT", `/products/${id}/structure`)).json();
  assertEquals(structured.state, "structured");
  assertEquals((await call("PUT", `/products/${id}/structure`)).status, 400);
  assertEquals((await call("PUT", `/products/${id}/legs`, { legs: [] })).status, 400);

  const issued = await (await call("PUT", `/products/${id}/issue`)).json();
  assertEquals(issued.state, "issued");
  assert(issued.issuedAt > 0);

  const sold = await (
    await call("PUT", `/products/${id}/sell`, { soldTo: "c-1", rfqId: "R1" })
  ).json();
  assertEquals(sold.state, "sold");
  assertEquals(sold.soldTo, "c-1");
  assertEquals(sold.rfqId, "R1");

  const unwound = await (await call("PUT", `/products/${id}/unwind`)).json();
  assertEquals(unwound.state, "unwound");
  assertEquals(topics(), [
    "products.updated",
    "products.updated",
    "products.sold",
    "products.updated",
  ]);
});

test("[product-service] selling tolerates a missing body and unknown ids are 404", async () => {
  const { productId: id } = await create();
  await call("PUT", `/products/${id}/structure`);
  await call("PUT", `/products/${id}/issue`);
  const sold = await (await call("PUT", `/products/${id}/sell`, "{bad")).json();
  assertEquals(sold.state, "sold");
  assertEquals(sold.soldTo, undefined);

  for (const action of ["issue", "sell", "unwind"]) {
    assertEquals((await call("PUT", `/products/NOPE/${action}`)).status, 404);
  }
});

test("[product-service] external clients only see issued and sold products, and stats count states", async () => {
  const { productId: id } = await create();
  await call("PUT", `/products/${id}/structure`);
  await call("PUT", `/products/${id}/issue`);

  const visible = await (await call("GET", "/products?userId=c-1&userRole=external-client")).json();
  assert(visible.length >= 1);
  assert(visible.every((p: { state: string }) => p.state === "issued" || p.state === "sold"));

  const stats = await (await call("GET", "/products/stats")).json();
  assert(stats.counts.issued >= 1);
  assertEquals(
    stats.total,
    Object.values(stats.counts as Record<string, number>).reduce((a, b) => a + b, 0)
  );
});
