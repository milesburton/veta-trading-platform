import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import type { RegulatoryRecord } from "../lib/regulatory-records.ts";
import {
  buildTransactionReports,
  formatTradingDateTime,
  parseReportDate,
  priceCurrencyFor,
  toCsv,
} from "./transaction-report.ts";

const record = (
  payload: Record<string, unknown>,
  eventType = "orders.filled"
): RegulatoryRecord => ({
  seq: 1,
  eventId: "orders.filled:c1:EX-1",
  eventType,
  ts: Date.UTC(2026, 10, 9, 14, 30, 5, 123),
  orderId: "o1",
  childId: "c1",
  payload,
  prevHash: "0".repeat(64),
  hash: "1".repeat(64),
});

const fill = {
  execId: "EX-1",
  childId: "c1",
  parentOrderId: "o1",
  asset: "AAPL",
  side: "BUY",
  filledQty: 50,
  avgFillPrice: 189.25,
  venue: "XNAS",
  ts: Date.UTC(2026, 10, 9, 14, 30, 5, 123),
  tsMicros: Date.UTC(2026, 10, 9, 14, 30, 5, 123) * 1000 + 456,
};

const submission = new Map([
  [
    "o1",
    {
      lei: "529900T8BM49AURSDO55",
      clientCode: "CLIENT-7",
      decisionMakerCode: "TRADER-3",
      executionDecisionCode: "VETA-TWAP",
      algoId: "VETA-TWAP",
    },
  ],
]);

test("[transaction-report] maps a buy fill to the documented field subset", () => {
  const [report] = buildTransactionReports([record({ ...fill, algoId: "VETA-TWAP" })], submission);
  assertEquals(report, {
    transactionReference: "orders.filled:c1:EX-1",
    executingEntityLei: "529900T8BM49AURSDO55",
    submittingEntityLei: "529900T8BM49AURSDO55",
    buyerCode: "CLIENT-7",
    sellerCode: "XNAS",
    tradingDateTime: "2026-11-09T14:30:05.123456Z",
    tradingCapacity: "AOTC",
    quantity: 50,
    price: 189.25,
    priceCurrency: "USD",
    venueMic: "XNAS",
    instrumentId: "AAPL",
    instrumentIdType: "SYMBOL",
    investmentDecisionCode: "TRADER-3",
    executionDecisionCode: "VETA-TWAP",
    algoIndicator: true,
    algoId: "VETA-TWAP",
    orderId: "o1",
  });
});

test("[transaction-report] puts the client on the sell side and leaves missing identifiers null", () => {
  const [report] = buildTransactionReports(
    [record({ ...fill, side: "SELL", tsMicros: undefined })],
    new Map()
  );
  assertEquals(report.sellerCode, "UNKNOWN");
  assertEquals(report.buyerCode, "XNAS");
  assertEquals(report.executingEntityLei, null);
  assertEquals(report.algoIndicator, false);
  assertEquals(report.tradingDateTime, "2026-11-09T14:30:05.123000Z");
});

test("[transaction-report] keeps references distinct when fills share an execId across EMS restarts", () => {
  const reports = buildTransactionReports(
    [
      { ...record({ ...fill }), eventId: "orders.filled:c1:EX00000001", childId: "c1" },
      {
        ...record({ ...fill, childId: "c2" }),
        eventId: "orders.filled:c2:EX00000001",
        childId: "c2",
      },
    ],
    submission
  );
  assertEquals(
    reports.map((r) => r.transactionReference),
    ["orders.filled:c1:EX00000001", "orders.filled:c2:EX00000001"]
  );
});

test("[transaction-report] reports the quote currency of FX pairs and USD otherwise", () => {
  assertEquals(priceCurrencyFor("USD/JPY"), "JPY");
  assertEquals(priceCurrencyFor("EUR/USD"), "USD");
  assertEquals(priceCurrencyFor("AAPL"), "USD");
  const [report] = buildTransactionReports(
    [record({ ...fill, asset: "USD/JPY", avgFillPrice: 145.5 })],
    submission
  );
  assertEquals(report.priceCurrency, "JPY");
});

test("[transaction-report] skips non-fill and malformed records", () => {
  const reports = buildTransactionReports(
    [record({ ...fill }, "orders.child"), record({ asset: "AAPL" }), record({ ...fill })],
    submission
  );
  assertEquals(reports.length, 1);
});

test("[transaction-report] formats microsecond timestamps", () => {
  assertEquals(formatTradingDateTime(1_700_000_000_000_123, 0), "2023-11-14T22:13:20.000123Z");
});

test("[transaction-report] CSV has a header row and escapes delimiters", () => {
  const [report] = buildTransactionReports([record({ ...fill })], submission);
  const csv = toCsv([{ ...report, buyerCode: 'A,"B"' }]);
  const lines = csv.trim().split("\n");
  assertEquals(lines[0].startsWith("transactionReference,executingEntityLei"), true);
  assertEquals(lines[1].includes('"A,""B"""'), true);
  assertEquals(toCsv([]), `${lines[0]}\n`);
});

test("[transaction-report] validates the report date", () => {
  assertEquals(parseReportDate("2026-11-09"), {
    fromMs: Date.UTC(2026, 10, 9),
    toMs: Date.UTC(2026, 10, 10),
  });
  assertEquals(parseReportDate("09/11/2026"), null);
  assertEquals(parseReportDate("2026-02-31"), null);
  assertEquals(parseReportDate("2026-13-01"), null);
  assertEquals(parseReportDate(null), null);
});
