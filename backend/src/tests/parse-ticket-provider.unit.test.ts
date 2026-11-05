import { test } from "#veta/test";
import { assert, assertEquals, assertRejects } from "#veta/test-assert";
import type { ILlmProvider } from "#veta/types/llm-advisory";
import {
  buildParseTicketProvider,
  createFallbackProvider,
  loadParseTicketProviderConfig,
  MAX_TIMEOUT_MS,
} from "../llm-advisory/parse-ticket-provider.ts";

function fake(id: string, opts: { available?: boolean; fail?: boolean } = {}): ILlmProvider {
  return {
    providerId: id,
    modelId: `${id}-model`,
    isAvailable: () => Promise.resolve(opts.available ?? true),
    generate: () =>
      opts.fail
        ? Promise.reject(new Error(`${id} failed`))
        : Promise.resolve({
            text: id,
            promptTokens: 0,
            completionTokens: 0,
            latencyMs: 1,
            rawResponse: "",
          }),
  };
}

test("parse-ticket provider config, defaults to ollama only and disabled", () => {
  const config = loadParseTicketProviderConfig({});
  assertEquals(config.enabled, false);
  assertEquals(config.chain, ["ollama"]);
  assertEquals(config.anthropicModelId, "claude-haiku-5-5");
  assertEquals(config.ollamaModelId, "qwen2.5:3b");
  assertEquals(config.timeoutMs, 45_000);
});

test("parse-ticket provider config, enabled only for the literal true", () => {
  assertEquals(loadParseTicketProviderConfig({ QUICK_TRADE_LLM_ENABLED: "true" }).enabled, true);
  assertEquals(loadParseTicketProviderConfig({ QUICK_TRADE_LLM_ENABLED: "1" }).enabled, false);
});

test("parse-ticket provider config, reads the chain and drops unknown names", () => {
  const config = loadParseTicketProviderConfig({
    QUICK_TRADE_LLM_PROVIDERS: " Ollama, mock ,anthropic",
    QUICK_TRADE_OLLAMA_MODEL_ID: "llama",
    LLM_OLLAMA_BASE_URL: "http://o:1",
    QUICK_TRADE_TIMEOUT_MS: "5000",
  });
  assertEquals(config.chain, ["ollama", "anthropic"]);
  assertEquals(config.ollamaModelId, "llama");
  assertEquals(config.ollamaBaseUrl, "http://o:1");
  assertEquals(config.timeoutMs, 5_000);
});

test("parse-ticket provider config, caps the timeout below the gateway proxy limit", () => {
  const config = loadParseTicketProviderConfig({ QUICK_TRADE_TIMEOUT_MS: "300000" });
  assertEquals(config.timeoutMs, MAX_TIMEOUT_MS);
});

test("fallback provider, uses the first available provider", async () => {
  const provider = createFallbackProvider([fake("a"), fake("b")]);
  assertEquals((await provider.generate("p", "s")).text, "a");
  assertEquals(provider.providerId, "a+b");
});

test("fallback provider, skips unavailable providers", async () => {
  const provider = createFallbackProvider([fake("a", { available: false }), fake("b")]);
  assertEquals((await provider.generate("p", "s")).text, "b");
});

test("fallback provider, falls through to the next provider when one throws", async () => {
  const provider = createFallbackProvider([fake("a", { fail: true }), fake("b")]);
  assertEquals((await provider.generate("p", "s")).text, "b");
});

test("fallback provider, rethrows the last error when every provider fails", async () => {
  const provider = createFallbackProvider([fake("a", { fail: true }), fake("b", { fail: true })]);
  await assertRejects(() => provider.generate("p", "s"), Error, "b failed");
});

test("fallback provider, is unavailable when none are available or none are configured", async () => {
  assertEquals(
    await createFallbackProvider([fake("a", { available: false })]).isAvailable(),
    false
  );
  const empty = createFallbackProvider([]);
  assertEquals(await empty.isAvailable(), false);
  await assertRejects(() => empty.generate("p", "s"), Error, "no LLM provider configured");
});

test("buildParseTicketProvider, builds one provider per configured name", () => {
  const provider = buildParseTicketProvider({
    enabled: true,
    chain: ["anthropic", "ollama"],
    anthropicModelId: "claude-haiku-5-5",
    ollamaModelId: "qwen2.5:3b",
    ollamaBaseUrl: "http://localhost:11434",
    timeoutMs: 1_000,
  });
  assertEquals(provider.providerId, "anthropic+ollama");
  assert(provider.modelId.length > 0);
});
