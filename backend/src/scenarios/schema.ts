import { z } from "@veta/zod";

export const ScenarioSpecSchema = z.object({
  seed: z.number().int(),
  symbol: z.string().min(1).max(16),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().positive(),
  limitPrice: z.number().positive(),
  strategy: z.string().min(1).max(32),
  algoParams: z.record(z.unknown()).optional(),
  durationMs: z
    .number()
    .int()
    .positive()
    .max(15 * 60_000)
    .optional(),
});

export const ScenarioExpectedSchema = z.object({
  fillCount: z.number().int().nonnegative().optional(),
  totalFilled: z.number().int().nonnegative().optional(),
  avgFillPriceBps: z.number().optional(),
  slippageBps: z.number().optional(),
  tolerance: z
    .object({
      fillCount: z.number().int().nonnegative().optional(),
      totalFilled: z.number().int().nonnegative().optional(),
      bps: z.number().nonnegative().optional(),
    })
    .optional(),
});

export const ScenarioCreateSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  spec: ScenarioSpecSchema,
  expected: ScenarioExpectedSchema.optional(),
});

export const ScenarioUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  spec: ScenarioSpecSchema.optional(),
  expected: ScenarioExpectedSchema.nullable().optional(),
});

export type ScenarioCreateInput = z.infer<typeof ScenarioCreateSchema>;
export type ScenarioUpdateInput = z.infer<typeof ScenarioUpdateSchema>;
