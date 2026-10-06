import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { AssetInfoBar } from "@veta/frontend/components/OrderTicket/AssetInfoBar";
import type { ExchangeStatus } from "@veta/frontend/domain/market/exchangeStatus";
import { marketSlice } from "@veta/frontend/store/marketSlice";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";

const exchangeStatusMock = vi.hoisted(() => vi.fn<() => ExchangeStatus | null>(() => null));

vi.mock("@veta/frontend/components/ExchangeBadge.tsx", () => ({
  ExchangeBadge: () => <span data-testid="exchange-badge">NASDAQ</span>,
  useExchangeStatus: exchangeStatusMock,
}));

function renderBar() {
  const store = configureStore({ reducer: { market: marketSlice.reducer } });
  store.dispatch(
    marketSlice.actions.setAssets([
      {
        symbol: "AAPL",
        initialPrice: 150,
        volatility: 0.02,
        sector: "Technology",
        exchange: "XNAS",
      },
    ])
  );
  render(
    <Provider store={store}>
      <AssetInfoBar symbol="AAPL" />
    </Provider>
  );
  return screen.getByText("Exchange").nextElementSibling;
}

describe("AssetInfoBar exchange cell", () => {
  afterEach(() => {
    exchangeStatusMock.mockReturnValue(null);
  });

  it("shows only the venue badge when the exchange status is known", () => {
    exchangeStatusMock.mockReturnValue({
      label: "NASDAQ",
      mic: "XNAS",
      isOpen: true,
      phase: "open",
    });
    const cell = renderBar();
    expect(cell).toHaveTextContent(/^NASDAQ$/);
  });

  it("falls back to the raw MIC when the status is unavailable", () => {
    const cell = renderBar();
    expect(cell).toHaveTextContent(/^XNAS$/);
    expect(screen.queryByTestId("exchange-badge")).toBeNull();
  });
});
