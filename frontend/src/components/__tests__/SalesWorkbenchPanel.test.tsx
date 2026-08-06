import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SellSideRfq } from "@veta/frontend/components/rfq/shared";
import { SalesWorkbenchPanel } from "@veta/frontend/components/SalesWorkbenchPanel";
import { authSlice } from "@veta/frontend/store/authSlice";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeStore() {
  return configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: {
        user: {
          id: "sales-1",
          name: "Sales User",
          role: "trader" as const,
          avatar_emoji: "S",
        },
        limits: {
          max_order_qty: 10_000,
          max_daily_notional: 1_000_000,
          allowed_strategies: ["LIMIT"],
          allowed_desks: ["equity"],
          dark_pool_access: false,
        },
        status: "authenticated" as const,
        sessionExpired: false,
      },
    },
  });
}

function renderPanel() {
  render(
    <Provider store={makeStore()}>
      <SalesWorkbenchPanel />
    </Provider>
  );
}

function makeRfq(overrides: Partial<SellSideRfq> = {}): SellSideRfq {
  return {
    rfqId: "rfq-1",
    state: "CLIENT_REQUEST",
    clientUserId: "client-a",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    createdAt: Date.now() - 5000,
    ts: Date.now() - 5000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SalesWorkbenchPanel", () => {
  it("shows empty state when no RFQs are available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ rfqs: [] }),
    } as Response);

    renderPanel();

    expect(await screen.findByText(/No RFQs in the system/i)).toBeInTheDocument();
    expect(screen.getByText(/0 RFQs/i)).toBeInTheDocument();
  });

  it("routes an actionable RFQ", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqs: [makeRfq()] }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rfqs: [
            makeRfq({
              state: "SALES_MARKUP",
              salesUserId: "sales-1",
              dealerBestPrice: 100,
            }),
          ],
        }),
      } as Response);

    renderPanel();

    await screen.findByText("rfq-1");
    fireEvent.click(screen.getByRole("button", { name: "Route" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gateway/rfq/sellside/rfq-1/route",
        expect.objectContaining({ method: "PUT" })
      );
    });

    expect(await screen.findByText(/Apply Markup/i)).toBeInTheDocument();
  });

  it("submits markup and shows computed client price", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rfqs: [
            makeRfq({
              state: "SALES_MARKUP",
              salesUserId: "sales-1",
              dealerBestPrice: 100,
            }),
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rfqs: [
            makeRfq({
              state: "CLIENT_CONFIRMATION",
              salesUserId: "sales-1",
              dealerBestPrice: 100,
            }),
          ],
        }),
      } as Response);

    renderPanel();

    await screen.findByText(/Apply Markup/i);
    fireEvent.change(screen.getByLabelText(/Markup \(bps\)/i), {
      target: { value: "50" },
    });
    expect(screen.getByText("$100.50")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Send Quote to Client/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gateway/rfq/sellside/rfq-1/markup",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ salesUserId: "sales-1", markupBps: 50 }),
        })
      );
    });
  });

  it("shows backend error when route action fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqs: [makeRfq()] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "cannot route" }),
      } as Response);

    renderPanel();

    await screen.findByText("rfq-1");
    fireEvent.click(screen.getByRole("button", { name: "Route" }));

    expect(await screen.findByText("cannot route")).toBeInTheDocument();
  });

  it("shows second age for fresh RFQs", async () => {
    const freshRfq = makeRfq({ createdAt: Date.now() - 5_000 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ rfqs: [freshRfq] }),
    } as Response);
    renderPanel();
    await screen.findByText(/^\d+s$/);
    expect(screen.getByText(/^\d+s$/)).toBeInTheDocument();
  });

  it("shows minute age for older RFQs", async () => {
    const oldRfq = makeRfq({ createdAt: Date.now() - 5 * 60_000 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ rfqs: [oldRfq] }),
    } as Response);
    renderPanel();
    await screen.findByText(/^5m$/);
    expect(screen.getByText(/^5m$/)).toBeInTheDocument();
  });

  it("shows hour age for very old RFQs", async () => {
    const oldRfq = makeRfq({ createdAt: Date.now() - 2 * 3_600_000 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ rfqs: [oldRfq] }),
    } as Response);
    renderPanel();
    await screen.findByText(/^2h$/);
    expect(screen.getByText(/^2h$/)).toBeInTheDocument();
  });

  it("shows thrown error message when route action rejects", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqs: [makeRfq()] }),
      } as Response)
      .mockRejectedValueOnce(new Error("network down"));

    renderPanel();

    await screen.findByText("rfq-1");
    fireEvent.click(screen.getByRole("button", { name: "Route" }));

    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("shows backend error when markup action fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rfqs: [
            makeRfq({
              state: "SALES_MARKUP",
              salesUserId: "sales-1",
              dealerBestPrice: 100,
            }),
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "cannot markup" }),
      } as Response);

    renderPanel();

    await screen.findByText(/Apply Markup/i);
    fireEvent.click(screen.getByRole("button", { name: /Send Quote to Client/i }));

    expect(await screen.findByText("cannot markup")).toBeInTheDocument();
  });

  it("rejects an RFQ from the incoming table", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqs: [makeRfq()] }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqs: [makeRfq({ state: "REJECTED" })] }),
      } as Response);

    renderPanel();

    await screen.findByText("rfq-1");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gateway/rfq/sellside/rfq-1/reject",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ rejectedBy: "sales-1" }),
        })
      );
    });
  });

  it("clears selection and shows error when reject throws", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rfqs: [
            makeRfq({
              state: "SALES_MARKUP",
              salesUserId: "sales-1",
              dealerBestPrice: 100,
            }),
          ],
        }),
      } as Response)
      .mockRejectedValueOnce(new Error("reject failed"));

    renderPanel();

    await screen.findByText(/Apply Markup/i);
    const rejectButtons = screen.getAllByRole("button", { name: /^Reject$/ });
    fireEvent.click(rejectButtons[rejectButtons.length - 1]);

    expect(await screen.findByText("reject failed")).toBeInTheDocument();
  });

  it("toggles row selection on click", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        rfqs: [
          makeRfq({
            rfqId: "rfq-7",
            state: "CLIENT_CONFIRMATION",
          }),
        ],
      }),
    } as Response);

    renderPanel();

    const cell = await screen.findByText("rfq-7");
    const row = cell.closest("tr") as HTMLTableRowElement;
    fireEvent.click(row);
    expect(row.className).toContain("bg-panel");
    fireEvent.click(row);
    expect(row.className).not.toContain("bg-panel");
  });

  it("opens markup section from the row Markup button", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        rfqs: [
          makeRfq({
            rfqId: "rfq-a",
            state: "SALES_MARKUP",
            salesUserId: "sales-1",
            dealerBestPrice: 100,
          }),
          makeRfq({
            rfqId: "rfq-b",
            state: "SALES_MARKUP",
            salesUserId: "sales-1",
            dealerBestPrice: 200,
          }),
        ],
      }),
    } as Response);

    renderPanel();

    await screen.findByText("rfq-a");
    const markupButtons = screen.getAllByRole("button", { name: "Markup" });
    fireEvent.click(markupButtons[1]);

    expect(await screen.findByText(/Apply Markup — rfq-b/i)).toBeInTheDocument();
  });

  it("renders empty state when no RFQs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ rfqs: [] }),
    } as Response);
    renderPanel();
    await waitFor(() => {
      expect(screen.queryByText("rfq-1")).not.toBeInTheDocument();
    });
  });
});
