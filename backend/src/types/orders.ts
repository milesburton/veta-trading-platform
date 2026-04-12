export interface RoutedOrder {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number;
  strategy?: string;
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
