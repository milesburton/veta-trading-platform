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

export interface RoutedOrder {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: OrderSide;
  quantity: number;
  limitPrice: number;
  expiresAt: number;
  strategy?: Strategy;
  algoParams?: Record<string, unknown>;
}

export interface FillEvent {
  childId?: string;
  parentOrderId?: string;
  clientOrderId?: string;
  algo?: string;
  filledQty?: number;
  avgFillPrice?: number;
}
