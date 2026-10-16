import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { startStack } from "./testcontainers/services.ts";

test({
  name: "testcontainers stack: boots market-sim + journal against ephemeral infra",
  ignore: process.env.RUN_TESTCONTAINERS !== "1",
  async fn() {
    const stack = await startStack({ services: ["market-sim", "journal"] });
    try {
      assert(stack.urls["market-sim"], "market-sim url should be set");
      assert(stack.urls.journal, "journal url should be set");

      const msHealth = await fetch(`${stack.urls["market-sim"]}/health`);
      await msHealth.body?.cancel();
      assertEquals(msHealth.status, 200);

      const jHealth = await fetch(`${stack.urls.journal}/health`);
      await jHealth.body?.cancel();
      assertEquals(jHealth.status, 200);
    } finally {
      await stack.teardown();
    }
  },
});
