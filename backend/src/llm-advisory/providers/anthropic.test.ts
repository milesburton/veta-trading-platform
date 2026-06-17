import { assertEquals, assertRejects } from "jsr:@std/assert@0.217";

import { createAnthropicProvider } from "./anthropic.ts";

Deno.test("anthropic provider: defaults to claude-opus-4-8 for the mock model id", () => {
  const provider = createAnthropicProvider("mock-v1", "sk-test");
  assertEquals(provider.providerId, "anthropic");
  assertEquals(provider.modelId, "claude-opus-4-8");
});

Deno.test("anthropic provider: honours an explicit model id", () => {
  const provider = createAnthropicProvider("claude-haiku-4-5", "sk-test");
  assertEquals(provider.modelId, "claude-haiku-4-5");
});

Deno.test("anthropic provider: is available only when an api key is present", async () => {
  assertEquals(
    await createAnthropicProvider("mock-v1", "sk-test").isAvailable(),
    true,
  );
  assertEquals(
    await createAnthropicProvider("mock-v1", "").isAvailable(),
    false,
  );
});

Deno.test("anthropic provider: generate throws without an api key", async () => {
  const provider = createAnthropicProvider("mock-v1", "");
  await assertRejects(
    () => provider.generate("hi", "system"),
    Error,
    "ANTHROPIC_API_KEY is not set",
  );
});
