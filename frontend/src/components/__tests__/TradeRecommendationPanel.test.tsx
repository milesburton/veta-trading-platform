import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TradeRecommendationPanel } from "../TradeRecommendationPanel";

const getRecommendations = vi.fn();

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetRecommendationsMutation: () => [getRecommendations, { isLoading: false, error: null }],
}));

vi.mock("../../store/selectors.ts", () => ({
  selectSymbols: () => ["AAPL", "MSFT"],
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      intelligence: {
        signals: {
          AAPL: {
            score: 0.72,
            direction: "long",
            confidence: 0.83,
            factors: [{ name: "momentum", weight: 1, contribution: 0.5 }],
          },
        },
      },
    };
    return selector(state);
  },
}));

describe("TradeRecommendationPanel", () => {
  beforeEach(() => {
    getRecommendations.mockReset();
    getRecommendations.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          symbol: "AAPL",
          spotPrice: 150,
          impliedVol: 0.25,
          recommendations: [
            {
              optionType: "call",
              strike: 155,
              expirySecs: 30 * 86400,
              price: 4.321,
              score: 68,
              signalStrength: "STRONG_BUY",
              reasons: ["momentum:+0.500", "ATM_HIGH_VOL"],
              greeks: {
                delta: 0.51,
                gamma: 0.02,
                theta: -0.03,
                vega: 0.11,
                rho: 0.01,
              },
              impliedVol: 0.25,
              scoringMode: "signal-driven",
              signalScore: 0.72,
              signalConfidence: 0.83,
              signalDirection: "long",
            },
          ],
          computedAt: Date.now(),
        }),
    });
  });

  it("renders panel and live signal banner", () => {
    render(<TradeRecommendationPanel />);

    expect(screen.getByTestId("recommendation-panel")).toBeInTheDocument();
    expect(screen.getByText(/Signal/i)).toBeInTheDocument();
    expect(screen.getByText(/\+0.720/)).toBeInTheDocument();
  });

  it("requests recommendations using signal context", async () => {
    render(<TradeRecommendationPanel />);

    fireEvent.click(screen.getByTestId("refresh-recommendations-btn"));

    await waitFor(() => {
      expect(getRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: "AAPL",
          signal: expect.objectContaining({
            score: 0.72,
            direction: "long",
            confidence: 0.83,
          }),
        })
      );
    });
  });

  it("renders recommendation row and expandable details", async () => {
    render(<TradeRecommendationPanel />);
    fireEvent.click(screen.getByTestId("refresh-recommendations-btn"));

    expect(await screen.findByTestId("recommendation-row")).toBeInTheDocument();
    expect(screen.getByText(/CALL/i)).toBeInTheDocument();
    expect(screen.getByText(/\$4.321/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/CALL/i));
    expect(screen.getByText(/Signal: \+0.720/i)).toBeInTheDocument();
    expect(screen.getAllByText(/signal-driven/i).length).toBeGreaterThan(0);
  });
});
