import type { OrderSide } from "#veta/primitives";

export interface Trade {
  asset: string;
  side: OrderSide;
  quantity: number;
  limitPrice: number;
  expiresAt: number;
}
