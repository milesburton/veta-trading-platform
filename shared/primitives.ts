export type OrderSide = "BUY" | "SELL";

export type Strategy =
  | "LIMIT"
  | "TWAP"
  | "POV"
  | "VWAP"
  | "ICEBERG"
  | "SNIPER"
  | "ARRIVAL_PRICE"
  | "IS"
  | "MOMENTUM";

export type Desk = "equity" | "fi" | "derivatives" | "fx" | "commodities";

export type AssetClass = "equity" | "fx" | "commodity" | "bond";

export type OrderStatus =
  | "pending"
  | "working"
  | "filled"
  | "expired"
  | "rejected"
  | "cancelled";

export type LiquidityFlag = "MAKER" | "TAKER" | "CROSS";
