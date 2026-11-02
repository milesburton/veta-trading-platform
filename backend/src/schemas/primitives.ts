import { z } from "zod";
import type {
  AssetClass,
  Desk,
  LiquidityFlag,
  OrderSide,
  OrderStatus,
  Strategy,
} from "#veta/primitives";

export type {
  AssetClass,
  Desk,
  LiquidityFlag,
  OrderSide,
  OrderStatus,
  Strategy,
} from "#veta/primitives";

export const OrderSideSchema = z.enum(["BUY", "SELL"]) satisfies z.ZodType<OrderSide>;

export const StrategySchema = z.enum([
  "LIMIT",
  "TWAP",
  "POV",
  "VWAP",
  "ICEBERG",
  "SNIPER",
  "ARRIVAL_PRICE",
  "IS",
  "MOMENTUM",
]) satisfies z.ZodType<Strategy>;

export const DeskSchema = z.enum([
  "equity",
  "fi",
  "derivatives",
  "fx",
  "commodities",
]) satisfies z.ZodType<Desk>;

const AssetClassSchema = z.enum([
  "equity",
  "fx",
  "commodity",
  "bond",
]) satisfies z.ZodType<AssetClass>;

const OrderStatusSchema = z.enum([
  "pending",
  "working",
  "filled",
  "expired",
  "rejected",
  "cancelled",
]) satisfies z.ZodType<OrderStatus>;

export const LiquidityFlagSchema = z.enum([
  "MAKER",
  "TAKER",
  "CROSS",
]) satisfies z.ZodType<LiquidityFlag>;

export const OrderIdSchema = z.string().min(1);
type OrderId = z.infer<typeof OrderIdSchema>;

export const ChildOrderIdSchema = z.string().min(1);
type ChildOrderId = z.infer<typeof ChildOrderIdSchema>;

export const UserIdSchema = z.string().min(1);
type UserId = z.infer<typeof UserIdSchema>;

export const ClientOrderIdSchema = z.string().min(1);
type ClientOrderId = z.infer<typeof ClientOrderIdSchema>;

export const SymbolSchema = z.string().min(1).max(32);
type Symbol = z.infer<typeof SymbolSchema>;

const PositiveNumberSchema = z.number().positive().finite();
const NonNegativeNumberSchema = z.number().nonnegative().finite();
export const TimestampMsSchema = z.number().int().nonnegative();
