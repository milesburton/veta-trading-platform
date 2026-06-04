// fallow-ignore-file unused-file
import type { FeatureVector, Signal, TradeRecommendation } from "@veta/types/intelligence";

export interface PlaybookContext {
  symbol: string;
  signal: Signal;
  features: FeatureVector | null;
  recommendation: TradeRecommendation | null;
  recentCloses: number[];
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  applies(ctx: PlaybookContext): boolean;
  contextLines(ctx: PlaybookContext): string[];
}
