import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RegulatoryReportsPanel } from "@veta/frontend/components/RegulatoryReportsPanel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const REPORT = {
  date: "2026-11-09",
  count: 1,
  unsupportedFields: ["ISIN and CFI instrument classification"],
  reports: [
    {
      transactionReference: "EX-1",
      tradingDateTime: "2026-11-09T14:30:05.123456Z",
      instrumentId: "AAPL",
      buyerCode: "CLIENT-7",
      sellerCode: "XNAS",
      quantity: 50,
      price: 189.25,
      venueMic: "XNAS",
      algoIndicator: true,
    },
  ],
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("RegulatoryReportsPanel", () => {
  it("prompts for a date before any request is made", () => {
    render(<RegulatoryReportsPanel />);
    expect(screen.getByText("Regulatory Reports")).toBeInTheDocument();
    expect(screen.getByText("Choose a date and preview the report.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews the report for the chosen date with credentials", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(REPORT));
    render(<RegulatoryReportsPanel />);
    fireEvent.change(screen.getByLabelText("Trading date (UTC)"), {
      target: { value: "2026-11-09" },
    });
    fireEvent.click(screen.getByText("Preview"));
    expect(await screen.findByText("EX-1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/gateway/reports/transactions?date=2026-11-09", {
      credentials: "include",
    });
    expect(screen.getByText("189.25")).toBeInTheDocument();
    expect(screen.getByText(/ISIN and CFI instrument classification/)).toBeInTheDocument();
  });

  it("reports an empty day", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ ...REPORT, count: 0, reports: [] }));
    render(<RegulatoryReportsPanel />);
    fireEvent.click(screen.getByText("Preview"));
    expect(await screen.findByText(/No fills recorded for/)).toBeInTheDocument();
  });

  it("shows permission and network errors", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({}, 403));
    render(<RegulatoryReportsPanel />);
    fireEvent.click(screen.getByText("Preview"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not permitted to read reports");

    fetchMock.mockReturnValueOnce(Promise.reject(new Error("down")));
    fireEvent.click(screen.getByText("Preview"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Report service unreachable")
    );
  });

  it("downloads the requested format", async () => {
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response("a,b\n", { status: 200 })));
    render(<RegulatoryReportsPanel />);
    fireEvent.click(screen.getByText("Download CSV"));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("format=csv");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
    click.mockRestore();
  });

  it("surfaces a failed download", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({}, 500));
    render(<RegulatoryReportsPanel />);
    fireEvent.click(screen.getByText("Download JSON"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Download failed (500)");
  });
});
