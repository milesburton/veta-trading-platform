import { z } from "zod";
import type { RegulatoryRecord } from "../lib/regulatory-records.ts";

export const TransactionReportSchema = z.object({
  transactionReference: z.string().min(1),
  executingEntityLei: z.string().length(20).nullable(),
  submittingEntityLei: z.string().length(20).nullable(),
  buyerCode: z.string().min(1),
  sellerCode: z.string().min(1),
  tradingDateTime: z.string().min(1),
  tradingCapacity: z.literal("AOTC"),
  quantity: z.number().positive(),
  price: z.number().positive(),
  priceCurrency: z.string().length(3),
  venueMic: z.string().nullable(),
  instrumentId: z.string().min(1),
  instrumentIdType: z.literal("SYMBOL"),
  investmentDecisionCode: z.string().nullable(),
  executionDecisionCode: z.string().nullable(),
  algoIndicator: z.boolean(),
  algoId: z.string().nullable(),
  orderId: z.string().nullable(),
});
export type TransactionReport = z.infer<typeof TransactionReportSchema>;

export const TRANSACTION_REPORT_COLUMNS = Object.keys(
  TransactionReportSchema.shape
) as (keyof TransactionReport)[];

export const UNSUPPORTED_FIELDS = [
  "ISIN and CFI instrument classification",
  "Natural person identifiers (national ID, date of birth)",
  "Short selling indicator",
  "Commodity derivative indicator",
  "Waiver and post-trade deferral flags",
  "Cancellation and amendment report types",
] as const;

const FillPayloadSchema = z.object({
  execId: z.string().min(1).optional(),
  childId: z.string().min(1).optional(),
  parentOrderId: z.string().min(1).optional(),
  asset: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  filledQty: z.number().positive(),
  avgFillPrice: z.number().positive(),
  venue: z.string().optional(),
  algoId: z.string().optional(),
  ts: z.number().optional(),
  tsMicros: z.number().optional(),
});

const SubmissionPayloadSchema = z.object({
  lei: z.string().optional(),
  clientCode: z.string().optional(),
  decisionMakerCode: z.string().optional(),
  executionDecisionCode: z.string().optional(),
  algoId: z.string().optional(),
  userId: z.string().optional(),
});

export type SubmissionIndex = ReadonlyMap<string, Record<string, unknown>>;

export function formatTradingDateTime(tsMicros: number | undefined, tsMs: number): string {
  if (tsMicros === undefined) return new Date(tsMs).toISOString().replace("Z", "000Z");
  const ms = Math.floor(tsMicros / 1000);
  const micros = String(tsMicros % 1_000_000).padStart(6, "0");
  return `${new Date(ms).toISOString().slice(0, 19)}.${micros}Z`;
}

export function priceCurrencyFor(symbol: string): string {
  const [, quote] = symbol.split("/");
  return quote && quote.length === 3 ? quote : "USD";
}

export function buildTransactionReports(
  fills: readonly RegulatoryRecord[],
  submissions: SubmissionIndex
): TransactionReport[] {
  const reports: TransactionReport[] = [];
  for (const record of fills) {
    if (record.eventType !== "orders.filled") continue;
    const fill = FillPayloadSchema.safeParse(record.payload);
    if (!fill.success) continue;
    const orderId = fill.data.parentOrderId ?? record.orderId ?? null;
    const submission = SubmissionPayloadSchema.safeParse(
      (orderId && submissions.get(orderId)) || {}
    );
    const order = submission.success ? submission.data : {};
    const lei = order.lei ?? null;
    const client = order.clientCode ?? order.userId ?? "UNKNOWN";
    const algoId = fill.data.algoId ?? order.algoId ?? null;
    const buy = fill.data.side === "BUY";
    const parsed = TransactionReportSchema.safeParse({
      transactionReference: record.eventId,
      executingEntityLei: lei,
      submittingEntityLei: lei,
      buyerCode: buy ? client : (fill.data.venue ?? "MARKET"),
      sellerCode: buy ? (fill.data.venue ?? "MARKET") : client,
      tradingDateTime: formatTradingDateTime(fill.data.tsMicros, fill.data.ts ?? record.ts),
      tradingCapacity: "AOTC",
      quantity: fill.data.filledQty,
      price: fill.data.avgFillPrice,
      priceCurrency: priceCurrencyFor(fill.data.asset),
      venueMic: fill.data.venue ?? null,
      instrumentId: fill.data.asset,
      instrumentIdType: "SYMBOL",
      investmentDecisionCode: order.decisionMakerCode ?? null,
      executionDecisionCode:
        order.executionDecisionCode ?? algoId ?? order.decisionMakerCode ?? null,
      algoIndicator: algoId !== null,
      algoId,
      orderId,
    });
    if (parsed.success) reports.push(parsed.data);
  }
  return reports;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(reports: readonly TransactionReport[]): string {
  const rows = reports.map((r) => TRANSACTION_REPORT_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return [TRANSACTION_REPORT_COLUMNS.join(","), ...rows].join("\n") + "\n";
}

export function parseReportDate(value: string | null): { fromMs: number; toMs: number } | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const fromMs = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || new Date(fromMs).toISOString().slice(0, 10) !== value) {
    return null;
  }
  return { fromMs, toMs: fromMs + 86_400_000 };
}
