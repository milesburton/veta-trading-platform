import { z } from "@veta/zod";
import {
  ChildOrderIdSchema,
  ClientOrderIdSchema,
  DeskSchema,
  LiquidityFlagSchema,
  OrderIdSchema,
  OrderSideSchema,
  StrategySchema,
  SymbolSchema,
  TimestampMsSchema,
  UserIdSchema,
} from "./primitives.ts";

const MarketTypeSchema = z.enum(["lit", "dark", "otc"]);

const InstrumentTypeSchema = z.enum(["equity", "option", "bond", "fx", "commodity"]);

const KillScopeSchema = z.enum(["all", "user", "algo", "market", "symbol"]);

const BondSpecSchema = z.object({
  isin: z.string().min(1),
  symbol: z.string().min(1),
  description: z.string(),
  couponRate: z.number(),
  maturityDate: z.string(),
  totalPeriods: z.number().int().nonnegative(),
  periodsPerYear: z.number().int().positive(),
  faceValue: z.number().positive(),
  yieldAtOrder: z.number(),
  creditRating: z.string(),
});

const OptionSpecSchema = z.object({
  optionType: z.enum(["call", "put"]),
  strike: z.number().positive(),
  expirySecs: z.number().nonnegative(),
  isOtc: z.boolean().optional(),
});

const AlgoParamsSchema = z.record(z.string(), z.unknown());

export const OrderNewSchema = z.object({
  clientOrderId: ClientOrderIdSchema.optional(),
  orderId: OrderIdSchema.optional(),
  userId: UserIdSchema,
  userRole: z.string().optional(),
  asset: SymbolSchema,
  side: OrderSideSchema,
  quantity: z.number().positive(),
  limitPrice: z.number().positive().optional(),
  expiresAt: TimestampMsSchema.optional(),
  strategy: StrategySchema.optional(),
  algoParams: AlgoParamsSchema.optional(),
  instrumentType: InstrumentTypeSchema.optional(),
  optionSpec: OptionSpecSchema.optional(),
  bondSpec: BondSpecSchema.optional(),
  desk: DeskSchema.optional(),
  ts: TimestampMsSchema.optional(),
});
export type OrderNew = z.infer<typeof OrderNewSchema>;

export const OrderSubmittedSchema = z.object({
  orderId: OrderIdSchema,
  clientOrderId: ClientOrderIdSchema.optional(),
  userId: UserIdSchema,
  ts: TimestampMsSchema,
  timeInForce: z.enum(["DAY", "GTC", "IOC", "FOK", "GTD"]).optional(),
  destinationVenue: z.string().optional(),
  accountId: z.string().optional(),
  asset: SymbolSchema,
  side: OrderSideSchema,
  quantity: z.number().positive(),
  limitPrice: z.number().positive().optional(),
  expiresAt: TimestampMsSchema.optional(),
  strategy: StrategySchema.optional(),
  algoParams: AlgoParamsSchema.optional(),
  instrumentType: InstrumentTypeSchema.optional(),
  desk: DeskSchema.optional(),
  marketType: MarketTypeSchema.optional(),
  bondSpec: BondSpecSchema.optional(),
  optionSpec: OptionSpecSchema.optional(),
});
export type OrderSubmitted = z.infer<typeof OrderSubmittedSchema>;

export const RoutedOrderSchema = OrderSubmittedSchema.extend({
  routedAt: TimestampMsSchema,
});
export type RoutedOrder = z.infer<typeof RoutedOrderSchema>;

export const OrderChildSchema = z.object({
  childId: ChildOrderIdSchema,
  parentOrderId: OrderIdSchema,
  clientOrderId: ClientOrderIdSchema.optional(),
  userId: UserIdSchema.optional(),
  algo: z.string().min(1),
  asset: SymbolSchema,
  side: OrderSideSchema,
  quantity: z.number().positive(),
  limitPrice: z.number().positive().optional(),
  marketPrice: z.number().positive().optional(),
  ts: TimestampMsSchema,
  venue: z.string().optional(),
  desk: DeskSchema.optional(),
  marketType: MarketTypeSchema.optional(),
  instrumentType: InstrumentTypeSchema.optional(),
  algoParams: AlgoParamsSchema.optional(),
  sliceIndex: z.number().int().nonnegative().optional(),
  numSlices: z.number().int().positive().optional(),
  vwap: z.number().positive().optional(),
  deviation: z.number().optional(),
  arrivalPrice: z.number().positive().optional(),
  driftBps: z.number().optional(),
  entryPrice: z.number().positive().optional(),
  signalBps: z.number().optional(),
  trancheIndex: z.number().int().nonnegative().optional(),
});
export type OrderChild = z.infer<typeof OrderChildSchema>;

export const FillEventSchema = z.object({
  execId: z.string().min(1).optional(),
  childId: ChildOrderIdSchema,
  parentOrderId: OrderIdSchema,
  clientOrderId: ClientOrderIdSchema.optional(),
  userId: UserIdSchema.optional(),
  algo: z.string().min(1),
  asset: SymbolSchema,
  side: OrderSideSchema,
  requestedQty: z.number().positive().optional(),
  filledQty: z.number().positive(),
  remainingQty: z.number().nonnegative().optional(),
  avgFillPrice: z.number().positive(),
  midPrice: z.number().positive().optional(),
  marketImpactBps: z.number().optional(),
  venue: z.string().optional(),
  counterparty: z.string().optional(),
  liquidityFlag: LiquidityFlagSchema.optional(),
  commissionUSD: z.number().nonnegative().optional(),
  secFeeUSD: z.number().nonnegative().optional(),
  finraTafUSD: z.number().nonnegative().optional(),
  totalFeeUSD: z.number().nonnegative().optional(),
  settlementDate: z.string().optional(),
  desk: DeskSchema.optional(),
  marketType: MarketTypeSchema.optional(),
  ts: TimestampMsSchema.optional(),
});
export type FillEvent = z.infer<typeof FillEventSchema>;

export const OrderExpiredSchema = z.object({
  orderId: OrderIdSchema.optional(),
  clientOrderId: ClientOrderIdSchema.optional(),
  userId: UserIdSchema.optional(),
  algo: z.string().optional(),
  asset: SymbolSchema,
  side: OrderSideSchema,
  quantity: z.number().positive().optional(),
  remainingQty: z.number().nonnegative().optional(),
  filledQty: z.number().nonnegative().optional(),
  avgFillPrice: z.number().positive().optional(),
  reason: z.string().optional(),
  ts: TimestampMsSchema,
});
export type OrderExpired = z.infer<typeof OrderExpiredSchema>;

export const OrderRejectedSchema = z.object({
  orderId: OrderIdSchema.optional(),
  clientOrderId: ClientOrderIdSchema.optional(),
  userId: UserIdSchema,
  reason: z.string(),
  ts: TimestampMsSchema,
});
export type OrderRejected = z.infer<typeof OrderRejectedSchema>;

export const OrderCancelledSchema = z.object({
  orderId: OrderIdSchema.optional(),
  clientOrderId: ClientOrderIdSchema,
  userId: UserIdSchema.optional(),
  asset: SymbolSchema.optional(),
  strategy: StrategySchema.optional(),
  desk: DeskSchema.optional(),
  reason: z.string().optional(),
  issuedBy: z.string().optional(),
  issuedByRole: z.string().optional(),
  ts: TimestampMsSchema,
});
export type OrderCancelled = z.infer<typeof OrderCancelledSchema>;

export const OrderKillCommandSchema = z.object({
  scope: KillScopeSchema,
  scopeValue: z.string().optional(),
  targetUserId: UserIdSchema.optional(),
  issuedBy: z.string().min(1),
  issuedByRole: z.string().min(1),
  ts: TimestampMsSchema,
});
export type OrderKillCommand = z.infer<typeof OrderKillCommandSchema>;

export const OrderResumeCommandSchema = z.object({
  scope: KillScopeSchema,
  scopeValue: z.string().optional(),
  targetUserId: UserIdSchema.optional(),
  resumeAt: TimestampMsSchema.optional(),
  issuedBy: z.string().min(1),
  issuedByRole: z.string().min(1),
  ts: TimestampMsSchema,
});
export type OrderResumeCommand = z.infer<typeof OrderResumeCommandSchema>;

export const OrderKillAuditSchema = OrderKillCommandSchema.extend({
  cancelledCount: z.number().int().nonnegative(),
  cancelledIds: z.array(z.string()),
});
export type OrderKillAudit = z.infer<typeof OrderKillAuditSchema>;

export const OrderResumeAuditSchema = OrderResumeCommandSchema.extend({
  resumeAt: TimestampMsSchema,
});
export type OrderResumeAudit = z.infer<typeof OrderResumeAuditSchema>;

export const OrderResumedSchema = z.object({
  scope: KillScopeSchema,
  scopeValue: z.string().optional(),
  targetUserId: UserIdSchema.optional(),
  issuedBy: z.string().min(1),
  issuedByRole: z.string().min(1),
  ts: TimestampMsSchema,
});
export type OrderResumed = z.infer<typeof OrderResumedSchema>;

export const OrderHoldCommandSchema = z.object({
  clientOrderId: ClientOrderIdSchema,
  issuedBy: z.string().min(1),
  issuedByRole: z.string().min(1),
  ts: TimestampMsSchema,
});
export type OrderHoldCommand = z.infer<typeof OrderHoldCommandSchema>;

export const OrderFiRfqSchema = RoutedOrderSchema;
export type OrderFiRfq = z.infer<typeof OrderFiRfqSchema>;
