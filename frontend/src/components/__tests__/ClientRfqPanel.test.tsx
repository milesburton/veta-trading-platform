import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import { ClientRfqPanel } from "../ClientRfqPanel";
import type { SellSideRfq } from "../rfq/shared";

function makeStore() {
  return configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: {
        user: {
          id: "client-1",
          name: "Client One",
          role: "trader" as const,
          avatar_emoji: "C",
        },
        limits: {
          max_order_qty: 10_000,
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
      <ClientRfqPanel />
    </Provider>
  );
}

function makeRfq(overrides: Partial<SellSideRfq> = {}): SellSideRfq {
  return {
    rfqId: "rfq-1",
    state: "CLIENT_REQUEST",
    clientUserId: "client-1",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    createdAt: Date.now() - 1_000,
    ts: Date.now() - 1_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClientRfqPanel", () => {
  it("submits an RFQ and shows success feedback", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqs: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqId: "rfq-new" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqs: [makeRfq({ rfqId: "rfq-new" })] }),
      } as Response);

    renderPanel();

    await screen.findByText(/No RFQs yet/i);

    fireEvent.change(screen.getByLabelText(/Symbol/i), {
      target: { value: "msft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "SELL" }));
    fireEvent.change(screen.getByLabelText(/Quantity/i), {
      target: { value: "250" },
    });
    fireEvent.change(screen.getByLabelText(/Limit Price/i), {
      target: { value: "101.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit RFQ/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gateway/rfq/sellside",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            clientUserId: "client-1",
            asset: "MSFT",
            side: "SELL",
            quantity: 250,
            limitPrice: 101.25,
          }),
        })
      );
    });

    expect(await screen.findByText(/RFQ submitted/i)).toBeInTheDocument();
  });

  it("shows API error feedback for failed submit", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqs: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid quantity" }),
      } as Response);

    renderPanel();

    await screen.findByText(/No RFQs yet/i);
    fireEvent.click(screen.getByRole("button", { name: /Submit RFQ/i }));

    expect(await screen.findByText("invalid quantity")).toBeInTheDocument();
  });

  it("renders confirmation actions and sends confirm/reject", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rfqs: [
            makeRfq({
              rfqId: "rfq-confirm",
              state: "CLIENT_CONFIRMATION",
              clientQuotedPrice: 100.12,
            }),
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqs: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rfqs: [
            makeRfq({
              rfqId: "rfq-confirm",
              state: "CLIENT_CONFIRMATION",
              clientQuotedPrice: 100.12,
            }),
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rfqs: [] }),
      } as Response);

    renderPanel();

    await screen.findByText("rfq-confirm");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gateway/rfq/sellside/rfq-confirm/confirm",
        expect.objectContaining({ method: "PUT" })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gateway/rfq/sellside/rfq-confirm/reject",
        expect.objectContaining({ method: "PUT" })
      );
    });
  });
});
