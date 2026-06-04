import { assert, assertEquals } from "jsr:@std/assert@0.217";
import type { ILlmProvider, LlmProviderResponse } from "@veta/types/llm-advisory";
import { handleParseTicket } from "../llm-advisory/parse-ticket-handler.ts";

interface FakeProviderOpts {
  available?: boolean;
  generate?: (prompt: string, system: string) => Promise<LlmProviderResponse>;
}

function makeProvider(opts: FakeProviderOpts = {}): ILlmProvider {
  return {
    providerId: "fake",
    modelId: "test",
    isAvailable() {
      return Promise.resolve(opts.available ?? true);
    },
    generate(prompt, system) {
      if (opts.generate) return opts.generate(prompt, system);
      return Promise.resolve({
        text: '{"side":"BUY","symbol":"AAPL","quantity":500,"limitPrice":200}',
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 1,
        rawResponse: "",
      });
    },
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://x/parse-ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("handleParseTicket — happy path returns parsed intent", async () => {
  const res = await handleParseTicket(jsonRequest({ input: "buy 500 aapl @ 200" }), {
    provider: makeProvider(),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.intent.side, "BUY");
  assertEquals(body.intent.symbol, "AAPL");
  assertEquals(body.intent.quantity, 500);
  assertEquals(body.intent.limitPrice, 200);
});

Deno.test("handleParseTicket — rejects empty / oversize input with 400", async () => {
  const empty = await handleParseTicket(jsonRequest({ input: "" }), { provider: makeProvider() });
  assertEquals(empty.status, 400);
  await empty.body?.cancel();

  const oversize = await handleParseTicket(jsonRequest({ input: "x".repeat(300) }), {
    provider: makeProvider(),
  });
  assertEquals(oversize.status, 400);
  await oversize.body?.cancel();
});

Deno.test("handleParseTicket — returns 503 when provider not available", async () => {
  const res = await handleParseTicket(jsonRequest({ input: "buy 500 aapl" }), {
    provider: makeProvider({ available: false }),
  });
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "llm_unavailable");
});

Deno.test("handleParseTicket — returns 503 when provider throws", async () => {
  const res = await handleParseTicket(jsonRequest({ input: "buy 500 aapl" }), {
    provider: makeProvider({
      generate: () => Promise.reject(new Error("boom")),
    }),
  });
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "llm_generate_failed");
});

Deno.test("handleParseTicket — strips markdown fences from model output", async () => {
  const res = await handleParseTicket(jsonRequest({ input: "buy 500 aapl @ 200" }), {
    provider: makeProvider({
      generate: () =>
        Promise.resolve({
          text: '```json\n{"side":"BUY","symbol":"AAPL","quantity":500}\n```',
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 1,
          rawResponse: "",
        }),
    }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.intent.symbol, "AAPL");
});

Deno.test("handleParseTicket — returns 422 on schema-mismatched response", async () => {
  const res = await handleParseTicket(jsonRequest({ input: "buy 500 aapl" }), {
    provider: makeProvider({
      generate: () =>
        Promise.resolve({
          text: '{"side":"INVALID","symbol":"AAPL"}',
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 1,
          rawResponse: "",
        }),
    }),
  });
  assertEquals(res.status, 422);
});

Deno.test("handleParseTicket — returns 422 when model emits explicit error", async () => {
  const res = await handleParseTicket(jsonRequest({ input: "hedge half my book" }), {
    provider: makeProvider({
      generate: () =>
        Promise.resolve({
          text: '{"error":"unparseable"}',
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 1,
          rawResponse: "",
        }),
    }),
  });
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.error, "unparseable");
});

Deno.test("handleParseTicket — returns 422 when symbol not in allowed list", async () => {
  const res = await handleParseTicket(
    jsonRequest({ input: "buy 500 unknownsym", symbols: ["AAPL", "MSFT"] }),
    {
      provider: makeProvider({
        generate: () =>
          Promise.resolve({
            text: '{"side":"BUY","symbol":"UNKNOWNSYM","quantity":500}',
            promptTokens: 0,
            completionTokens: 0,
            latencyMs: 1,
            rawResponse: "",
          }),
      }),
    }
  );
  assertEquals(res.status, 422);
  const body = await res.json();
  assertEquals(body.error, "unknown_symbol");
});

Deno.test("handleParseTicket — passes through symbol when in allowed list", async () => {
  const res = await handleParseTicket(
    jsonRequest({ input: "buy 500 aapl", symbols: ["AAPL", "MSFT"] }),
    {
      provider: makeProvider({
        generate: () =>
          Promise.resolve({
            text: '{"side":"BUY","symbol":"AAPL","quantity":500}',
            promptTokens: 0,
            completionTokens: 0,
            latencyMs: 1,
            rawResponse: "",
          }),
      }),
    }
  );
  assertEquals(res.status, 200);
});

Deno.test("handleParseTicket — sanitises control chars from input before prompt", async () => {
  let receivedPrompt = "";
  const res = await handleParseTicket(jsonRequest({ input: "buy 500 aapl\n\rmalicious" }), {
    provider: makeProvider({
      generate: (prompt) => {
        receivedPrompt = prompt;
        return Promise.resolve({
          text: '{"side":"BUY","symbol":"AAPL"}',
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 1,
          rawResponse: "",
        });
      },
    }),
  });
  assertEquals(res.status, 200);
  assert(!receivedPrompt.includes("\n\r"), "control chars must be stripped from prompt");
});

Deno.test("handleParseTicket — rejects invalid JSON body with 400", async () => {
  const req = new Request("http://x/parse-ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not json",
  });
  const res = await handleParseTicket(req, { provider: makeProvider() });
  assertEquals(res.status, 400);
});
