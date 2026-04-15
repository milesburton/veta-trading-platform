import { z } from "@veta/zod";
import {
  OrderSideSchema,
  SymbolSchema,
  UserIdSchema,
} from "./primitives.ts";

export const RiskConfigSchema = z.object({
  fatFingerPct: z.number(),
  maxOpenOrders: z.number().int(),
  duplicateWindowMs: z.number().int(),
  maxOrdersPerSecond: z.number().int(),
  maxAdvPct: z.number(),
  maxGrossNotional: z.number(),
  maxDailyLoss: z.number(),
  maxConcentrationPct: z.number(),
  haltMovePercent: z.number(),
  breakerCooldownMs: z.number().int(),
  breakersEnabled: z.boolean(),
});
export type RiskConfig = z.infer<typeof RiskConfigSchema>;

export const RiskConfigUpdateSchema = RiskConfigSchema.partial();
export type RiskConfigUpdate = z.infer<typeof RiskConfigUpdateSchema>;

export const CheckRequestSchema = z.object({
  orderId: z.string().optional(),
  userId: UserIdSchema,
  userRole: z.string().optional(),
  symbol: SymbolSchema,
  side: OrderSideSchema,
  quantity: z.number().positive(),
  limitPrice: z.number().positive(),
  strategy: z.string().optional(),
  instrumentType: z.string().optional(),
});
export type CheckRequest = z.infer<typeof CheckRequestSchema>;

export const CheckResultSchema = z.object({
  allowed: z.boolean(),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const BreakerFireSchema = z.object({
  type: z.enum(["market-move", "user-pnl"]),
  scope: z.enum(["symbol", "user"]),
  target: z.string().min(1),
  observedValue: z.number(),
  threshold: z.number(),
  firedAt: z.number().int().nonnegative(),
});
export type BreakerFire = z.infer<typeof BreakerFireSchema>;

export const TestPositionSchema = z.object({
  userId: UserIdSchema,
  symbol: SymbolSchema,
  netQty: z.number(),
  avgPrice: z.number().nonnegative(),
  realisedPnl: z.number().optional(),
});
export type TestPosition = z.infer<typeof TestPositionSchema>;

export const TestTickSchema = z.object({
  prices: z.record(z.string(), z.number()).optional(),
  openPrices: z.record(z.string(), z.number()).optional(),
});
export type TestTick = z.infer<typeof TestTickSchema>;
