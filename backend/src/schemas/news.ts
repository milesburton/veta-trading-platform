import { z } from "@veta/zod";
import { SymbolSchema, TimestampMsSchema } from "./primitives.ts";

export const NewsSentimentSchema = z.enum(["positive", "negative", "neutral"]);

export const NewsSignalSchema = z.object({
  symbol: SymbolSchema,
  sentiment: NewsSentimentSchema,
  score: z.number(),
  headline: z.string().optional(),
  source: z.string().optional(),
  ts: TimestampMsSchema.optional(),
});
export type NewsSignal = z.infer<typeof NewsSignalSchema>;
