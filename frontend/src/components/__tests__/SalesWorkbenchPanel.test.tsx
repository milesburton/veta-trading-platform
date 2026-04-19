import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import type { SellSideRfq } from "../rfq/shared";
import { SalesWorkbenchPanel } from "../SalesWorkbenchPanel";

function makeStore() {
  return configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: {
        user: {
          id: "sales-1",
          name: "Sales User",
          role: "trader",
          avatar_emoji: "S",
        },
        limits: {
          max_order_qty: 10000,
          max_daily_notional: 1_000_000,
          allowed_strategies: ["LIMIT"],
          allowed_desks: ["equity"],
          dark_pool_access: false,
        },
        status: "authenticated" as const,
      },
    },
  });
}

function renderPanel() {
  render(
    <Provider store={makeStore()}>
      <SalesWorkbenchPanel />
    </Provider>,
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
    createdAt: Date.now() - 5_000,
    ts: Date.now() - 5_000,
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
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ rfqs: [] }),
    } as Response);

    renderPanel();

    expect(await screen.findByText(/No RFQs in the system/i)).toBeInTheDocument();
    expect(screen.getByText(/0 RFQs/i)).toBeInTheDocument();
  });

  it("routes an actionable RFQ", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
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
        expect.objectContaining({ method: "PUT" }),
      );
    });

    expect(await screen.findByText(/Apply Markup/i)).toBeInTheDocument();
  });

  it("submits markup and shows computed client price", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
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
        }),
      );
    });
  });

  it("shows backend error when route action fails", async () => {
    vi.spyOn(global, "fetch")
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
});
