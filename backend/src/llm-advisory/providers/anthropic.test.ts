import { test } from "#veta/test";
import { assertEquals, assertRejects } from "#veta/test-assert";

import { createAnthropicProvider } from "./anthropic.ts";

test("anthropic provider: defaults to claude-opus-4-8 for the mock model id", () => {
  const provider = createAnthropicProvider("mock-v1", "sk-test");
  assertEquals(provider.providerId, "anthropic");
  assertEquals(provider.modelId, "claude-opus-4-8");
});

test("anthropic provider: honours an explicit model id", () => {
  const provider = createAnthropicProvider("claude-haiku-4-5", "sk-test");
  assertEquals(provider.modelId, "claude-haiku-4-5");
});

test("anthropic provider: is available only when an api key is present", async () => {
  assertEquals(
    await createAnthropicProvider("mock-v1", "sk-test").isAvailable(),
    true,
  );
  assertEquals(
    await createAnthropicProvider("mock-v1", "").isAvailable(),
    false,
  );
});

test("anthropic provider: generate throws without an api key", async () => {
  const provider = createAnthropicProvider("mock-v1", "");
  await assertRejects(
    () => provider.generate("hi", "system"),
    Error,
    "ANTHROPIC_API_KEY is not set",
  );
});

test("anthropic provider: generate returns text blocks, token usage and latency", async () => {
  const realFetch = globalThis.fetch;
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5",
          content: [
            { type: "text", text: "Hello " },
            { type: "tool_use", id: "t1", name: "noop", input: {} },
            { type: "text", text: "world" },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 12, output_tokens: 34 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }) as typeof fetch;

  try {
    const provider = createAnthropicProvider("claude-haiku-4-5", "sk-test");
    const result = await provider.generate("the prompt", "the system prompt");

    assertEquals(result.text, "Hello world");
    assertEquals(result.promptTokens, 12);
    assertEquals(result.completionTokens, 34);
    assertEquals(result.latencyMs >= 0, true);
    assertEquals(JSON.parse(result.rawResponse).id, "msg_1");
    assertEquals(requests.length, 1);
    assertEquals(requests[0].body.model, "claude-haiku-4-5");
    assertEquals(requests[0].body.system, "the system prompt");
    assertEquals(requests[0].body.messages, [{ role: "user", content: "the prompt" }]);
    assertEquals(requests[0].body.max_tokens, 4_096);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("anthropic provider: generate surfaces an API error", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    )) as typeof fetch;

  try {
    const provider = createAnthropicProvider("claude-haiku-4-5", "sk-bad");
    await assertRejects(() => provider.generate("p", "s"));
  } finally {
    globalThis.fetch = realFetch;
  }
});
