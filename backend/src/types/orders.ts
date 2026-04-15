import type { LiquidityFlag, OrderSide, Strategy } from "@veta/primitives";

export type { LiquidityFlag, OrderSide, Strategy } from "@veta/primitives";

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
  childId: string;
  parentOrderId: string;
  clientOrderId?: string;
  algo: string;
  asset: string;
  side: OrderSide;
  filledQty: number;
  avgFillPrice: number;
  venue?: string;
  counterparty?: string;
  liquidityFlag?: LiquidityFlag;
  commissionUSD?: number;
  marketImpactBps?: number;
}
