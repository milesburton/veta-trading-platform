import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { startStack } from "./testcontainers/services.ts";

Deno.test({
  name: "testcontainers stack: boots market-sim + journal against ephemeral infra",
  ignore: Deno.env.get("RUN_TESTCONTAINERS") !== "1",
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
