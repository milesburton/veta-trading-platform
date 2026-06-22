export type OrderSide = "BUY" | "SELL";

export const STRATEGIES = [
  "LIMIT",
  "TWAP",
  "POV",
  "VWAP",
  "ICEBERG",
  "SNIPER",
  "ARRIVAL_PRICE",
  "IS",
  "MOMENTUM",
] as const;

export type Strategy = (typeof STRATEGIES)[number];

export type Desk = "equity" | "fi" | "derivatives" | "fx" | "commodities";

export type AssetClass = "equity" | "fx" | "commodity" | "bond";

export type OrderStatus = "pending" | "working" | "filled" | "expired" | "rejected" | "cancelled";

export type LiquidityFlag = "MAKER" | "TAKER" | "CROSS";
