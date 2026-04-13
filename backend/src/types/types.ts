import type { OrderSide } from "./orders.ts";

export interface Trade {
  asset: string;
  side: OrderSide;
  quantity: number;
  limitPrice: number;
  expiresAt: number;
}
