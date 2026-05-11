import { z } from "@veta/zod";

export const ParseTicketRequestSchema = z.object({
  input: z.string().min(1).max(200),
  symbols: z.array(z.string().regex(/^[A-Z][A-Z0-9._-]{0,15}$/)).max(2000).optional(),
});

export type ParseTicketRequest = z.infer<typeof ParseTicketRequestSchema>;

export const QuickTradeIntentSchema = z.object({
  side: z.enum(["BUY", "SELL"]),
  symbol: z.string().min(1).max(16).regex(/^[A-Z][A-Z0-9._-]*$/),
  quantity: z.number().int().positive().max(100_000_000).optional(),
  limitPrice: z.number().positive().max(1_000_000_000).optional(),
  strategy: z
    .enum(["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG", "SNIPER", "ARRIVAL_PRICE", "IS", "MOMENTUM"])
    .optional(),
  tif: z.enum(["DAY", "IOC", "GTC", "FOK"]).optional(),
  twapDurationMinutes: z.number().positive().max(1440).optional(),
  povRatePercent: z.number().positive().max(100).optional(),
  icebergVisibleQty: z.number().int().positive().max(100_000_000).optional(),
});

export type QuickTradeIntent = z.infer<typeof QuickTradeIntentSchema>;
