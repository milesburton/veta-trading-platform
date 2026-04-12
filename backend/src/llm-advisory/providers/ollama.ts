import type {
  ILlmProvider,
  LlmProviderResponse,
} from "@veta/types/llm-advisory";

interface OllamaGenerateResponse {
  response: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export function createOllamaProvider(
  modelId: string,
  baseUrl: string,
): ILlmProvider {
  const base = baseUrl.replace(/\/$/, "");

  return {
    providerId: "ollama",
    modelId,

    async generate(
      prompt: string,
      systemPrompt: string,
    ): Promise<LlmProviderResponse> {
      const start = Date.now();
      const res = await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          prompt,
          system: systemPrompt,
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Ollama error ${res.status}: ${msg}`);
      }
      const data = await res.json() as OllamaGenerateResponse;
      const latencyMs = Date.now() - start;
      return {
        text: data.response,
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        latencyMs,
        rawResponse: JSON.stringify(data),
      };
    },

    async isAvailable(): Promise<boolean> {
      try {
        const res = await fetch(`${base}/api/tags`, {
          signal: AbortSignal.timeout(3_000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
