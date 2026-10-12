import { assert, assertEquals, assertRejects } from "jsr:@std/assert@0.217";
import { createMockProvider } from "../llm-advisory/providers/mock.ts";
import { createOllamaProvider } from "../llm-advisory/providers/ollama.ts";

interface Captured {
  url: string;
  method?: string;
  body?: Record<string, unknown>;
}

function stubFetch(handler: (captured: Captured) => Response): { captured: Captured[]; restore: () => void } {
  const realFetch = globalThis.fetch;
  const captured: Captured[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const entry: Captured = {
      url: String(input),
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    captured.push(entry);
    return Promise.resolve(handler(entry));
  }) as typeof fetch;
  return {
    captured,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

Deno.test("[ollama] generate posts the prompt to /api/generate and maps token counts", async () => {
  const stub = stubFetch(() =>
    new Response(JSON.stringify({ response: "advice", prompt_eval_count: 21, eval_count: 8 }), { status: 200 })
  );
  try {
    const provider = createOllamaProvider("llama3", "http://ollama:11434/");
    const result = await provider.generate("prompt", "system");

    assertEquals(provider.providerId, "ollama");
    assertEquals(provider.modelId, "llama3");
    assertEquals(result.text, "advice");
    assertEquals(result.promptTokens, 21);
    assertEquals(result.completionTokens, 8);
    assert(result.latencyMs >= 0);
    assertEquals(JSON.parse(result.rawResponse).response, "advice");
    assertEquals(stub.captured[0].url, "http://ollama:11434/api/generate");
    assertEquals(stub.captured[0].method, "POST");
    assertEquals(stub.captured[0].body, { model: "llama3", prompt: "prompt", system: "system", stream: false });
  } finally {
    stub.restore();
  }
});

Deno.test("[ollama] generate defaults missing token counts to zero", async () => {
  const stub = stubFetch(() => new Response(JSON.stringify({ response: "x" }), { status: 200 }));
  try {
    const result = await createOllamaProvider("m", "http://o").generate("p", "s");
    assertEquals(result.promptTokens, 0);
    assertEquals(result.completionTokens, 0);
  } finally {
    stub.restore();
  }
});

Deno.test("[ollama] generate throws with the status and body on a non-ok response", async () => {
  const stub = stubFetch(() => new Response("model not found", { status: 404 }));
  try {
    await assertRejects(
      () => createOllamaProvider("missing", "http://o").generate("p", "s"),
      Error,
      "Ollama error 404: model not found",
    );
  } finally {
    stub.restore();
  }
});

Deno.test("[ollama] isAvailable reflects /api/tags and swallows network errors", async () => {
  const up = stubFetch(() => new Response("{}", { status: 200 }));
  try {
    assertEquals(await createOllamaProvider("m", "http://o/").isAvailable(), true);
    assertEquals(up.captured[0].url, "http://o/api/tags");
  } finally {
    up.restore();
  }

  const down = stubFetch(() => new Response("", { status: 503 }));
  try {
    assertEquals(await createOllamaProvider("m", "http://o").isAvailable(), false);
  } finally {
    down.restore();
  }

  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new TypeError("connection refused"))) as typeof fetch;
  try {
    assertEquals(await createOllamaProvider("m", "http://o").isAvailable(), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[mock provider] is always available and returns a deterministic canned response per prompt", async () => {
  const provider = createMockProvider();
  assertEquals(provider.providerId, "mock");
  assertEquals(await provider.isAvailable(), true);

  const first = await provider.generate("same prompt", "system");
  const second = await provider.generate("same prompt", "system");
  assertEquals(first.text, second.text);
  assertEquals(first.promptTokens, 50);
  assertEquals(first.completionTokens, 120);
  assert(first.text.includes("Not financial advice"));

  const texts = new Set(
    await Promise.all(Array.from({ length: 12 }, (_, i) => provider.generate(`prompt ${i}`, "s").then((r) => r.text))),
  );
  assert(texts.size > 1, "different prompts should reach different canned responses");
});
