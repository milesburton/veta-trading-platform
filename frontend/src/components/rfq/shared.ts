import type { OrderSide } from "../../types.ts";
export type SellSideRfqState =
  | "CLIENT_REQUEST"
  | "SALES_REVIEW"
  | "DEALER_QUOTE"
  | "SALES_MARKUP"
  | "CLIENT_CONFIRMATION"
  | "CONFIRMED"
  | "REJECTED";

export interface SellSideRfq {
  rfqId: string;
  state: SellSideRfqState;
  clientUserId: string;
  salesUserId?: string;
  asset: string;
  side: OrderSide;
  quantity: number;
  limitPrice?: number;
  dealerBestPrice?: number;
  salesMarkupBps?: number;
  clientQuotedPrice?: number;
  rejectedBy?: string;
  rejectionReason?: string;
  createdAt: number;
  ts: number;
}

export const SELL_SIDE_RFQ_STATE_COLORS: Record<SellSideRfqState, string> = {
  CLIENT_REQUEST: "bg-blue-900 text-blue-300",
  SALES_REVIEW: "bg-yellow-900 text-yellow-300",
  DEALER_QUOTE: "bg-yellow-900 text-yellow-300",
  SALES_MARKUP: "bg-yellow-900 text-yellow-300",
  CLIENT_CONFIRMATION: "bg-amber-900 text-amber-300",
  CONFIRMED: "bg-emerald-900 text-emerald-300",
  REJECTED: "bg-red-900 text-red-400",
};
