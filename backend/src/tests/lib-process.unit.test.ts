import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { runCommand } from "../lib/process.ts";

test("[process] runs allowlisted commands", async () => {
  const result = await runCommand("df", ["-Pk", "/"]);
  assertEquals(result.code, 0);
});

test("[process] rejects commands outside the allowlist", async () => {
  let message = "";
  try {
    await runCommand("rm", ["-rf", "/nonexistent"]);
  } catch (err) {
    message = (err as Error).message;
  }
  assertEquals(message, "command not permitted: rm");
});
