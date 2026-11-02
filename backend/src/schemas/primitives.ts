import { z } from "zod";
import type { Desk, LiquidityFlag, OrderSide, Strategy } from "#veta/primitives";

export type { Desk, LiquidityFlag, OrderSide, Strategy } from "#veta/primitives";

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

export const LiquidityFlagSchema = z.enum([
  "MAKER",
  "TAKER",
  "CROSS",
]) satisfies z.ZodType<LiquidityFlag>;

export const OrderIdSchema = z.string().min(1);

export const ChildOrderIdSchema = z.string().min(1);

export const UserIdSchema = z.string().min(1);

export const ClientOrderIdSchema = z.string().min(1);

export const SymbolSchema = z.string().min(1).max(32);

export const TimestampMsSchema = z.number().int().nonnegative();
