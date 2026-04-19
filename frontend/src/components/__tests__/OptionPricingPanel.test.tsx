import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OptionPricingPanel } from "../OptionPricingPanel";

const getQuote = vi.fn();
const dispatch = vi.fn();

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetQuoteMutation: () => [getQuote, { isLoading: false, error: null }],
}));

vi.mock("../../store/selectors.ts", () => ({
  selectSymbols: () => ["AAPL", "MSFT"],
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      market: { prices: { AAPL: 150.25, MSFT: 305.1 } },
      ui: { optionPrefill: null },
    };
    return selector(state);
  },
}));

vi.mock("recharts", () => {
  const MockContainer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: MockContainer,
    LineChart: MockContainer,
    CartesianGrid: () => null,
    Legend: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Line: () => null,
  };
});

describe("OptionPricingPanel", () => {
  beforeEach(() => {
    dispatch.mockReset();
    getQuote.mockReset();
    getQuote.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          symbol: "AAPL",
          optionType: "put",
          strike: 150,
          expirySecs: 30 * 86400,
          spotPrice: 150.25,
          impliedVol: 0.24,
          price: 5.1,
          greeks: { delta: -0.4, gamma: 0.02, theta: -0.03, vega: 0.1, rho: -0.02 },
          computedAt: Date.now(),
        }),
    });
  });

  it("prefills strike from current spot and renders panel", async () => {
    render(<OptionPricingPanel />);

    expect(screen.getByTestId("option-pricing-panel")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("strike-input")).toHaveValue(150.25);
    });
  });

  it("submits quote request with selected option type", async () => {
    render(<OptionPricingPanel />);

    fireEvent.click(screen.getByTestId("put-btn"));
    fireEvent.change(screen.getByTestId("strike-input"), { target: { value: "150" } });
    fireEvent.click(screen.getByTestId("get-quote-btn"));

    await waitFor(() => {
      expect(getQuote).toHaveBeenCalledWith({
        symbol: "AAPL",
        optionType: "put",
        strike: 150,
        expirySecs: 30 * 86400,
      });
    });
  });

  it("renders computed quote and greeks", async () => {
    render(<OptionPricingPanel />);
    fireEvent.click(screen.getByTestId("get-quote-btn"));

    expect(await screen.findByTestId("quote-result")).toBeInTheDocument();
    expect(screen.getByText(/Theoretical Price/i)).toBeInTheDocument();
    expect(screen.getByText(/\$5.1000/)).toBeInTheDocument();
    expect(screen.getByText(/Δ Delta/i)).toBeInTheDocument();
    expect(screen.getByText(/Γ Gamma/i)).toBeInTheDocument();
  });
});
