import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.217";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";
const T = (ms = 8_000) => AbortSignal.timeout(ms);

function url(stack: TestStack, name: keyof TestStack["urls"]): string {
  const u = stack.urls[name];
  if (!u) throw new Error(`${name} URL not in stack`);
  return u;
}

interface Product {
  productId: string;
  state: string;
  legs: Array<{ legId: string; symbol: string; weight: number }>;
}

Deno.test({
  name: "product-service lifecycle (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({
      services: ["product-service"],
      startupTimeoutMs: 45_000,
    });
    const PS = url(stack, "product-service");

    async function create(name: string): Promise<Product> {
      const res = await fetch(`${PS}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          createdBy: "sales-1",
          targetNotional: 1_000_000,
          legs: [
            { type: "equity", symbol: "AAPL", weight: 0.6 },
            { type: "equity", symbol: "MSFT", weight: 0.4 },
          ],
        }),
        signal: T(),
      });
      assertEquals(res.status, 201);
      return (await res.json()) as Product;
    }

    try {
      await t.step("rejects creation without required fields", async () => {
        const res = await fetch(`${PS}/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: "no name or notional" }),
          signal: T(),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step(
        "full lifecycle: create → structure → issue → sell",
        async () => {
          const product = await create("Tech Basket Note");
          assertExists(product.productId);
          assertEquals(product.state, "draft");
          assertEquals(product.legs.length, 2);
          const id = product.productId;

          const structureRes = await fetch(`${PS}/products/${id}/structure`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            signal: T(),
          });
          assertEquals(structureRes.status, 200);
          assertEquals(
            ((await structureRes.json()) as Product).state,
            "structured",
          );

          const issueRes = await fetch(`${PS}/products/${id}/issue`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            signal: T(),
          });
          assertEquals(issueRes.status, 200);
          assertEquals(((await issueRes.json()) as Product).state, "issued");

          const sellRes = await fetch(`${PS}/products/${id}/sell`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ soldTo: "ext-client-1" }),
            signal: T(),
          });
          assertEquals(sellRes.status, 200);
          assertEquals(((await sellRes.json()) as Product).state, "sold");
        },
      );

      await t.step("cannot issue a product that is still a draft", async () => {
        const product = await create("Premature Issue");
        const res = await fetch(`${PS}/products/${product.productId}/issue`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal: T(),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step(
        "structuring fails when leg weights do not sum to 1.0",
        async () => {
          const createRes = await fetch(`${PS}/products`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Unbalanced",
              createdBy: "sales-1",
              targetNotional: 500_000,
              legs: [{ type: "equity", symbol: "AAPL", weight: 0.5 }],
            }),
            signal: T(),
          });
          const product = (await createRes.json()) as Product;
          const res = await fetch(
            `${PS}/products/${product.productId}/structure`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: "{}",
              signal: T(),
            },
          );
          assertEquals(res.status, 400);
          await res.body?.cancel();
        },
      );

      await t.step("GET /products/:id returns a created product", async () => {
        const product = await create("Fetch Me");
        const res = await fetch(`${PS}/products/${product.productId}`, {
          signal: T(),
        });
        assertEquals(res.status, 200);
        assertEquals(
          ((await res.json()) as Product).productId,
          product.productId,
        );
      });

      await t.step(
        "GET /products/:id 404s for an unknown product",
        async () => {
          const res = await fetch(`${PS}/products/does-not-exist`, {
            signal: T(),
          });
          assertEquals(res.status, 404);
          await res.body?.cancel();
        },
      );

      await t.step("/products/stats counts products by state", async () => {
        const res = await fetch(`${PS}/products/stats`, { signal: T() });
        assertEquals(res.status, 200);
        const stats = (await res.json()) as {
          counts: Record<string, number>;
          total: number;
        };
        assert(
          stats.total >= 4,
          `expected at least 4 products, got ${stats.total}`,
        );
        assertEquals(stats.counts.sold, 1);
      });
    } finally {
      await stack.teardown();
    }
  },
});
