import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newsSlice, type NewsItem } from "../../store/newsSlice";
import { uiSlice } from "../../store/uiSlice";
import { AnalysisPanel } from "../AnalysisPanel";

const refetch = vi.fn();
const queryState: {
  data: NewsItem[] | undefined;
  isFetching: boolean;
} = {
  data: undefined,
  isFetching: false,
};

vi.mock("../../store/newsApi.ts", () => ({
  useGetNewsBySymbolQuery: () => ({
    data: queryState.data,
    isFetching: queryState.isFetching,
    refetch,
  }),
}));

function makeStore(selectedAsset: string | null = null) {
  return configureStore({
    reducer: {
      ui: uiSlice.reducer,
      news: newsSlice.reducer,
    },
    preloadedState: {
      ui: {
        activeStrategy: "TWAP",
        activeSide: "BUY",
        showShortcuts: false,
        selectedAsset,
        updateAvailable: false,
        upgradeStatus: { inProgress: false, message: null },
        optionPrefill: null,
        orderTicketWindowSize: { w: 480, h: 780 },
      },
      news: {
        bySymbol: {},
      },
    },
  });
}

function renderPanel(selectedAsset: string | null = null) {
  render(
    <Provider store={makeStore(selectedAsset)}>
      <AnalysisPanel />
    </Provider>,
  );
}

describe("AnalysisPanel", () => {
  beforeEach(() => {
    queryState.data = undefined;
    queryState.isFetching = false;
    refetch.mockReset();
  });

  it("shows empty state when no asset is selected", () => {
    renderPanel(null);

    expect(screen.getByText(/Select an asset to see news/i)).toBeInTheDocument();
  });

  it("shows fetch prompt when selected asset has no news", () => {
    renderPanel("AAPL");

    expect(screen.getByText(/No news for AAPL yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fetch now/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders fetched news and sentiment summary", async () => {
    queryState.data = [
      {
        id: "n-1",
        symbol: "AAPL",
        headline: "Apple beats estimates",
        source: "Reuters",
        url: "https://example.com/apple",
        publishedAt: Date.now() - 60_000,
        sentiment: "positive",
        sentimentScore: 0.8,
        relatedSymbols: ["AAPL", "QQQ"],
      },
      {
        id: "n-2",
        symbol: "AAPL",
        headline: "Supply chain concerns persist",
        source: "Bloomberg",
        url: "https://example.com/supply",
        publishedAt: Date.now() - 120_000,
        sentiment: "negative",
        sentimentScore: -0.4,
        relatedSymbols: ["AAPL"],
      },
    ];

    renderPanel("AAPL");

    await waitFor(() => {
      expect(screen.getByTestId("news-feed")).toBeInTheDocument();
    });
    expect(screen.getByText("Apple beats estimates")).toBeInTheDocument();
    expect(screen.getByText("Supply chain concerns persist")).toBeInTheDocument();
    expect(screen.getByText(/▲ 1/i)).toBeInTheDocument();
    expect(screen.getByText(/▼ 1/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "↺" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
