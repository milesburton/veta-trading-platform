import Anthropic from "npm:@anthropic-ai/sdk@0.69.0";
import type {
  ILlmProvider,
  LlmProviderResponse,
} from "@veta/types/llm-advisory";

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 4_096;

/**
 * Claude provider for the LLM-advisory subsystem.
 *
 * Mirrors the ollama provider's shape against the official Anthropic SDK.
 * Reads the API key from ANTHROPIC_API_KEY; the key is never logged or
 * persisted.
 */
export function createAnthropicProvider(
  modelId: string,
  apiKey: string = Deno.env.get("ANTHROPIC_API_KEY") ?? "",
): ILlmProvider {
  const model = modelId && modelId !== "mock-v1" ? modelId : DEFAULT_MODEL;
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  return {
    providerId: "anthropic",
    modelId: model,

    async generate(
      prompt: string,
      systemPrompt: string,
    ): Promise<LlmProviderResponse> {
      if (!client) {
        throw new Error("ANTHROPIC_API_KEY is not set");
      }
      const start = Date.now();
      const message = await client.messages.create({
        model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      });

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      return {
        text,
        promptTokens: message.usage.input_tokens,
        completionTokens: message.usage.output_tokens,
        latencyMs: Date.now() - start,
        rawResponse: JSON.stringify(message),
      };
    },

    isAvailable(): Promise<boolean> {
      return Promise.resolve(apiKey.length > 0);
    },
  };
}
