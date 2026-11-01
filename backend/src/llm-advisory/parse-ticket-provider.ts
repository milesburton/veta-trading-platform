import type { ILlmProvider, LlmProviderResponse } from "#veta/types/llm-advisory";
import { createAnthropicProvider } from "../lib/llm-providers/anthropic.ts";
import { createOllamaProvider } from "../lib/llm-providers/ollama.ts";

const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
const DEFAULT_CHAIN = "anthropic,ollama";
const DEFAULT_TIMEOUT_MS = 45_000;

export interface ParseTicketProviderConfig {
  chain: readonly string[];
  anthropicModelId: string;
  ollamaModelId: string;
  ollamaBaseUrl: string;
  timeoutMs: number;
}

export function loadParseTicketProviderConfig(
  env: NodeJS.ProcessEnv = process.env
): ParseTicketProviderConfig {
  return {
    chain: (env.QUICK_TRADE_LLM_PROVIDERS ?? DEFAULT_CHAIN)
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name === "anthropic" || name === "ollama"),
    anthropicModelId: env.QUICK_TRADE_ANTHROPIC_MODEL_ID ?? DEFAULT_ANTHROPIC_MODEL,
    ollamaModelId: env.QUICK_TRADE_OLLAMA_MODEL_ID ?? env.LLM_MODEL_ID ?? DEFAULT_OLLAMA_MODEL,
    ollamaBaseUrl: env.LLM_OLLAMA_BASE_URL ?? "http://localhost:11434",
    timeoutMs: Number(env.QUICK_TRADE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

export function createFallbackProvider(providers: readonly ILlmProvider[]): ILlmProvider {
  const primary = providers[0];
  return {
    providerId: providers.map((p) => p.providerId).join("+") || "none",
    modelId: primary?.modelId ?? "none",

    async generate(prompt: string, systemPrompt: string): Promise<LlmProviderResponse> {
      let lastError: unknown = new Error("no LLM provider configured");
      for (const candidate of providers) {
        if (!(await candidate.isAvailable())) continue;
        try {
          return await candidate.generate(prompt, systemPrompt);
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    },

    async isAvailable(): Promise<boolean> {
      for (const candidate of providers) {
        if (await candidate.isAvailable()) return true;
      }
      return false;
    },
  };
}

export function buildParseTicketProvider(
  config: ParseTicketProviderConfig = loadParseTicketProviderConfig()
): ILlmProvider {
  const providers = config.chain.map((name) =>
    name === "anthropic"
      ? createAnthropicProvider(config.anthropicModelId)
      : createOllamaProvider(config.ollamaModelId, config.ollamaBaseUrl)
  );
  return createFallbackProvider(providers);
}
