import type {
  ILlmProvider,
  LlmProviderResponse,
} from "../../types/llm-advisory.ts";

const CANNED_RESPONSES = [
  `**Signal Analysis (Simulated)**\n\nThis is a mock advisory for educational purposes only. The signal indicates a directional bias based on momentum and sector relative strength. Realised volatility is within normal parameters. No trade action is recommended based on this simulation.\n\n*This is a simulated response. Not financial advice.*`,
  `**Market Context (Simulated)**\n\nThis is a mock advisory for educational purposes only. Feature data suggests elevated news velocity which may be contributing to the current signal direction. Event scores from the calendar adapter are factored into confidence. Further analysis is required before any trading decision.\n\n*This is a simulated response. Not financial advice.*`,
  `**Advisory Summary (Simulated)**\n\nThis is a mock advisory for educational purposes only. The recommendation engine has flagged this instrument based on weighted signal scoring. Sector relative strength divergence is a primary contributor. Monitor for reversal signals before committing to a position.\n\n*This is a simulated response. Not financial advice.*`,
];

export function createMockProvider(): ILlmProvider {
  return {
    providerId: "mock",
    modelId: "mock-v1",

    async generate(
      prompt: string,
      _systemPrompt: string,
    ): Promise<LlmProviderResponse> {
      await new Promise<void>((r) => setTimeout(r, 50));
      const encoder = new TextEncoder();
      const hash = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(prompt),
      );
      const index = new Uint8Array(hash)[0] % CANNED_RESPONSES.length;
      const text = CANNED_RESPONSES[index];
      return {
        text,
        promptTokens: 50,
        completionTokens: 120,
        latencyMs: 50,
        rawResponse: text,
      };
    },

    isAvailable(): Promise<boolean> {
      return Promise.resolve(true);
    },
  };
}
