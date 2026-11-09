import { useSignal } from "@preact/signals-react";

interface TransactionReportRow {
  transactionReference: string;
  tradingDateTime: string;
  instrumentId: string;
  buyerCode: string;
  sellerCode: string;
  quantity: number;
  price: number;
  venueMic: string | null;
  algoIndicator: boolean;
}

interface ReportResponse {
  date: string;
  count: number;
  unsupportedFields: string[];
  reports: TransactionReportRow[];
}

const REPORT_URL = "/api/gateway/reports/transactions";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RegulatoryReportsPanel() {
  const date = useSignal(today());
  const result = useSignal<ReportResponse | null>(null);
  const error = useSignal<string | null>(null);
  const loading = useSignal(false);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${REPORT_URL}?date=${date.value}`, { credentials: "include" });
      if (!res.ok) {
        error.value =
          res.status === 403 ? "Not permitted to read reports" : `Request failed (${res.status})`;
        result.value = null;
        return;
      }
      result.value = (await res.json()) as ReportResponse;
    } catch {
      error.value = "Report service unreachable";
      result.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function download(format: "csv" | "json") {
    error.value = null;
    try {
      const res = await fetch(`${REPORT_URL}?date=${date.value}&format=${format}`, {
        credentials: "include",
      });
      if (!res.ok) {
        error.value = `Download failed (${res.status})`;
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `transactions-${date.value}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      error.value = "Report service unreachable";
    }
  }

  return (
    <div className="flex flex-col h-full bg-page text-default text-xs">
      <div className="px-4 py-2.5 border-b border-panel shrink-0 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          Regulatory Reports
        </span>
        <span className="text-muted">Transaction reports, RTS 22 field subset</span>
      </div>
      <div className="px-4 py-2 border-b border-panel shrink-0 flex items-center gap-2">
        <label htmlFor="report-date" className="text-muted">
          Trading date (UTC)
        </label>
        <input
          id="report-date"
          type="date"
          value={date.value}
          onChange={(e) => {
            date.value = e.target.value;
          }}
          className="bg-input border border-panel rounded px-2 py-1"
        />
        <button
          type="button"
          onClick={load}
          disabled={loading.value}
          className="px-2 py-1 border border-panel rounded"
        >
          {loading.value ? "Loading" : "Preview"}
        </button>
        <button
          type="button"
          onClick={() => download("csv")}
          className="px-2 py-1 border border-panel rounded"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={() => download("json")}
          className="px-2 py-1 border border-panel rounded"
        >
          Download JSON
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        {error.value ? (
          <p role="alert" className="text-red-400">
            {error.value}
          </p>
        ) : result.value === null ? (
          <p className="text-muted">Choose a date and preview the report.</p>
        ) : result.value.count === 0 ? (
          <p className="text-muted">No fills recorded for {result.value.date}.</p>
        ) : (
          <>
            <p className="text-muted mb-2">
              {result.value.count} transaction{result.value.count === 1 ? "" : "s"} on{" "}
              {result.value.date}
            </p>
            <table className="w-full">
              <thead>
                <tr className="text-muted text-left text-[10px] uppercase tracking-wider">
                  <th className="py-1">Reference</th>
                  <th className="py-1">Time (UTC)</th>
                  <th className="py-1">Instrument</th>
                  <th className="py-1">Buyer</th>
                  <th className="py-1">Seller</th>
                  <th className="py-1 text-right">Qty</th>
                  <th className="py-1 text-right">Price</th>
                  <th className="py-1">Venue</th>
                  <th className="py-1">Algo</th>
                </tr>
              </thead>
              <tbody>
                {result.value.reports.map((r) => (
                  <tr key={r.transactionReference} className="border-t border-panel">
                    <td className="py-1">{r.transactionReference}</td>
                    <td className="py-1">{r.tradingDateTime}</td>
                    <td className="py-1">{r.instrumentId}</td>
                    <td className="py-1">{r.buyerCode}</td>
                    <td className="py-1">{r.sellerCode}</td>
                    <td className="py-1 text-right">{r.quantity}</td>
                    <td className="py-1 text-right">{r.price.toFixed(2)}</td>
                    <td className="py-1">{r.venueMic ?? ""}</td>
                    <td className="py-1">{r.algoIndicator ? "Y" : "N"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted mt-3">
              Not reported: {result.value.unsupportedFields.join("; ")}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
