import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { walk } from "jsr:@std/fs@1.0.0";
import { relative } from "jsr:@std/path@1.0.0";

const SRC_ROOT = new URL("../", import.meta.url).pathname;

const ORDERS_NEW_PRODUCERS = new Set<string>([
  "gateway/routes/websocket.ts",
  "gateway/routes/admin.ts",
  "gateway/loadAgent.ts",
  "rfq/rfq-service.ts",
  "scenarios/orchestrator.ts",
]);

const ORDERS_SUBMITTED_PRODUCERS = new Set<string>([
  "oms/oms-server.ts",
]);

async function findProducers(topic: string): Promise<Set<string>> {
  const found = new Set<string>();
  const pattern = new RegExp(
    String.raw`producer[?]?\.send\s*\(\s*["']${topic.replace(/\./g, "\\.")}["']`,
  );

  for await (
    const entry of walk(SRC_ROOT, {
      exts: [".ts"],
      skip: [/tests/, /node_modules/, /\.test\.ts$/],
    })
  ) {
    if (!entry.isFile) continue;
    const text = await Deno.readTextFile(entry.path);
    if (pattern.test(text)) {
      const rel = relative(SRC_ROOT, entry.path);
      found.add(rel);
    }
  }
  return found;
}

Deno.test("risk-bypass: every producer of orders.new is on the allowlist", async () => {
  const found = await findProducers("orders.new");
  const unexpected = [...found].filter((f) => !ORDERS_NEW_PRODUCERS.has(f));
  assertEquals(
    unexpected,
    [],
    `New producer of orders.new found that is not on the allowlist:\n  ${
      unexpected.join("\n  ")
    }\n\nIf this is intentional, add the file to ORDERS_NEW_PRODUCERS in this test and document it in docs/site/src/content/docs/platform/risk-architecture.md.\nIf not, route the order through orders.new (gateway/OMS) instead of publishing directly.`,
  );
  for (const expected of ORDERS_NEW_PRODUCERS) {
    assert(
      found.has(expected),
      `Expected producer of orders.new not found: ${expected}. Either it was renamed/removed (update the allowlist) or refactored away (also update the doc).`,
    );
  }
});

Deno.test("risk-bypass: only oms/oms-server.ts produces orders.submitted", async () => {
  const found = await findProducers("orders.submitted");
  const unexpected = [...found].filter((f) => !ORDERS_SUBMITTED_PRODUCERS.has(f));
  assertEquals(
    unexpected,
    [],
    `New producer of orders.submitted found that is not OMS:\n  ${
      unexpected.join("\n  ")
    }\n\norders.submitted is the post-risk-check topic. Anything publishing to it bypasses the OMS pre-trade risk gate. If this is intentional (extremely unlikely), document it in risk-architecture.md and add to ORDERS_SUBMITTED_PRODUCERS. Otherwise, refactor to publish via orders.new.`,
  );
});
