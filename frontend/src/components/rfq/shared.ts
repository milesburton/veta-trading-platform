import type { OrderSide } from "@veta/frontend/types.ts";
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
  CLIENT_REQUEST: "bg-semantic-status-info/6 text-semantic-status-info",
  SALES_REVIEW: "bg-semantic-status-warning/6 text-semantic-status-warning",
  DEALER_QUOTE: "bg-semantic-status-warning/6 text-semantic-status-warning",
  SALES_MARKUP: "bg-semantic-status-warning/6 text-semantic-status-warning",
  CLIENT_CONFIRMATION: "bg-semantic-status-pending/6 text-semantic-status-pending",
  CONFIRMED: "bg-semantic-status-success/6 text-semantic-status-success",
  REJECTED: "bg-semantic-status-critical/6 text-semantic-status-critical",
};
