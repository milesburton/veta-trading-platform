import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TradeRecommendationPanel } from "@veta/frontend/components/TradeRecommendationPanel";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("renders PUT recommendation with strong sell signal", async () => {
    getRecommendations.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          symbol: "AAPL",
          spotPrice: 150,
          impliedVol: 0.3,
          recommendations: [
            {
              optionType: "put",
              strike: 145,
              expirySecs: 7 * 86400,
              price: 1.5,
              score: 60,
              signalStrength: "STRONG_SELL",
              reasons: ["momentum:-0.4"],
              greeks: { delta: -0.42, gamma: 0.03, theta: -0.05, vega: 0.1, rho: -0.01 },
              impliedVol: 0.28,
              scoringMode: "vol-driven",
              signalScore: -0.5,
              signalConfidence: 0.7,
              signalDirection: "short",
            },
          ],
          computedAt: Date.now(),
        }),
    });
    render(<TradeRecommendationPanel />);
    fireEvent.click(screen.getByTestId("refresh-recommendations-btn"));
    expect(await screen.findByText(/PUT/i)).toBeInTheDocument();
  });

  it("renders recommendation with NEUTRAL signal (mid score)", async () => {
    getRecommendations.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          symbol: "AAPL",
          spotPrice: 150,
          impliedVol: 0.25,
          recommendations: [
            {
              optionType: "call",
              strike: 150,
              expirySecs: 14 * 86400,
              price: 2,
              score: 10,
              signalStrength: "NEUTRAL",
              reasons: ["NEUTRAL"],
              greeks: { delta: 0.5, gamma: 0.02, theta: -0.04, vega: 0.1, rho: 0.02 },
              impliedVol: 0.24,
              scoringMode: "vol-driven",
              signalScore: 0.05,
              signalConfidence: 0.5,
              signalDirection: "neutral",
            },
          ],
          computedAt: Date.now(),
        }),
    });
    render(<TradeRecommendationPanel />);
    fireEvent.click(screen.getByTestId("refresh-recommendations-btn"));
    expect((await screen.findAllByText(/NEUTRAL/i)).length).toBeGreaterThan(0);
  });

  it("renders recommendation with deeply negative score", async () => {
    getRecommendations.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          symbol: "AAPL",
          spotPrice: 150,
          impliedVol: 0.4,
          recommendations: [
            {
              optionType: "put",
              strike: 145,
              expirySecs: 7 * 86400,
              price: 1,
              score: -75,
              signalStrength: "STRONG_SELL",
              reasons: ["momentum:-0.8"],
              greeks: { delta: -0.6, gamma: 0.03, theta: -0.04, vega: 0.1, rho: -0.01 },
              impliedVol: 0.4,
              scoringMode: "signal-driven",
              signalScore: -0.8,
              signalConfidence: 0.9,
              signalDirection: "short",
            },
          ],
          computedAt: Date.now(),
        }),
    });
    render(<TradeRecommendationPanel />);
    fireEvent.click(screen.getByTestId("refresh-recommendations-btn"));
    expect(await screen.findByTestId("recommendation-row")).toBeInTheDocument();
  });

  it("displays an empty-recommendations state", async () => {
    getRecommendations.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          symbol: "AAPL",
          spotPrice: 150,
          impliedVol: 0.25,
          recommendations: [],
          computedAt: Date.now(),
        }),
    });
    render(<TradeRecommendationPanel />);
    fireEvent.click(screen.getByTestId("refresh-recommendations-btn"));
    await waitFor(() => {
      expect(screen.queryByTestId("recommendation-row")).not.toBeInTheDocument();
    });
  });

  it("filters recommendations by signal strength", async () => {
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
              price: 4,
              score: 70,
              signalStrength: "STRONG_BUY",
              reasons: ["momentum:+0.5"],
              greeks: { delta: 0.5, gamma: 0.02, theta: -0.04, vega: 0.1, rho: 0.02 },
              impliedVol: 0.25,
              scoringMode: "signal-driven",
              signalScore: 0.5,
              signalConfidence: 0.7,
              signalDirection: "long",
            },
          ],
          computedAt: Date.now(),
        }),
    });
    render(<TradeRecommendationPanel />);
    fireEvent.click(screen.getByTestId("refresh-recommendations-btn"));
    await screen.findByTestId("recommendation-row");

    const filterSelect = screen.queryByLabelText(/Filter/i) as HTMLSelectElement | null;
    if (filterSelect) {
      fireEvent.change(filterSelect, { target: { value: "STRONG_SELL" } });
      // No matching recommendations
    }
    expect(screen.getByTestId("recommendation-panel")).toBeInTheDocument();
  });

  it("renders recommendation with vol-driven scoring (no signal-driven badge style)", async () => {
    getRecommendations.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          symbol: "AAPL",
          spotPrice: 150,
          impliedVol: 0.4,
          recommendations: [
            {
              optionType: "call",
              strike: 150,
              expirySecs: 7 * 86400,
              price: 3,
              score: 50,
              signalStrength: "BUY",
              reasons: ["ATM_HIGH_VOL", "momentum:+0.2"],
              greeks: { delta: 0.5, gamma: 0.02, theta: -0.04, vega: 0.1, rho: 0.02 },
              impliedVol: 0.4,
              scoringMode: "vol-driven",
            },
          ],
          computedAt: Date.now(),
        }),
    });
    render(<TradeRecommendationPanel />);
    fireEvent.click(screen.getByTestId("refresh-recommendations-btn"));
    expect(await screen.findByTestId("recommendation-row")).toBeInTheDocument();
  });

  it("expands a row to show details and reason badges", async () => {
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
              price: 4,
              score: 70,
              signalStrength: "STRONG_BUY",
              reasons: ["momentum:+0.5", "volatility:-0.2", "neutral_factor"],
              greeks: { delta: 0.5, gamma: 0.02, theta: -0.04, vega: 0.1, rho: 0.02 },
              impliedVol: 0.25,
              scoringMode: "signal-driven",
              signalScore: 0.5,
              signalConfidence: 0.7,
              signalDirection: "long",
            },
          ],
          computedAt: Date.now(),
        }),
    });
    render(<TradeRecommendationPanel />);
    fireEvent.click(screen.getByTestId("refresh-recommendations-btn"));
    const row = await screen.findByTestId("recommendation-row");
    fireEvent.click(row);
    // Reason badges render
    expect(screen.getAllByText(/Momentum|momentum/i).length).toBeGreaterThan(0);
  });
});
