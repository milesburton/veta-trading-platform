import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OptionPricingPanel } from "@veta/frontend/components/OptionPricingPanel";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getQuote = vi.fn();
const dispatch = vi.fn();

let mockState: {
  market: { prices: Record<string, number> };
  ui: { optionPrefill: { strike: number; expirySecs: number } | null };
} = {
  market: { prices: { AAPL: 150.25, MSFT: 305.1 } },
  ui: { optionPrefill: null },
};

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetQuoteMutation: () => [getQuote, { isLoading: false, error: null }],
}));

vi.mock("../../store/selectors.ts", () => ({
  selectSymbols: () => ["AAPL", "MSFT"],
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
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
    mockState = {
      market: { prices: { AAPL: 150.25, MSFT: 305.1 } },
      ui: { optionPrefill: null },
    };
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
          greeks: {
            delta: -0.4,
            gamma: 0.02,
            theta: -0.03,
            vega: 0.1,
            rho: -0.02,
          },
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
    fireEvent.change(screen.getByTestId("strike-input"), {
      target: { value: "150" },
    });
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

  it("renders the Greeks-vs-spot sensitivity section after a quote arrives", async () => {
    render(<OptionPricingPanel />);
    fireEvent.click(screen.getByTestId("get-quote-btn"));
    await screen.findByTestId("quote-result");
    expect(screen.getByText(/Greeks vs Spot/i)).toBeInTheDocument();
  });

  it("does not render the sensitivity section before a quote", () => {
    render(<OptionPricingPanel />);
    expect(screen.queryByText(/Greeks vs Spot/i)).not.toBeInTheDocument();
  });

  it("consumes an option prefill and clears it on mount", async () => {
    mockState = {
      market: { prices: {} },
      ui: { optionPrefill: { strike: 175.5, expirySecs: 14 * 86400 } },
    };

    render(<OptionPricingPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("strike-input")).toHaveValue(175.5);
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "ui/setOptionPrefill",
      payload: null,
    });
  });

  it("updates the selected symbol from the dropdown", () => {
    render(<OptionPricingPanel />);

    fireEvent.change(screen.getByLabelText(/Symbol/i), {
      target: { value: "MSFT" },
    });

    expect(screen.getByLabelText(/Symbol/i)).toHaveValue("MSFT");
  });

  it("selects a preset expiry and clears any custom date", () => {
    render(<OptionPricingPanel />);

    fireEvent.change(screen.getByTestId("expiry-input"), {
      target: { value: "2099-01-01" },
    });
    expect(screen.getByTestId("expiry-input")).toHaveValue("2099-01-01");

    fireEvent.click(screen.getByText("7d"));
    expect(screen.getByTestId("expiry-input")).toHaveValue("");
  });

  it("derives expiry from a custom date and uses it in the quote request", async () => {
    mockState = {
      market: { prices: {} },
      ui: { optionPrefill: null },
    };

    render(<OptionPricingPanel />);

    fireEvent.change(screen.getByTestId("strike-input"), {
      target: { value: "150" },
    });
    fireEvent.change(screen.getByTestId("expiry-input"), {
      target: { value: "2099-06-16" },
    });
    fireEvent.click(screen.getByTestId("get-quote-btn"));

    await waitFor(() => {
      expect(getQuote).toHaveBeenCalled();
    });
    const arg = getQuote.mock.calls[0][0];
    expect(arg.expirySecs).toBeGreaterThan(30 * 86400);
  });

  it("ignores an empty custom date and keeps the preset expiry", async () => {
    render(<OptionPricingPanel />);

    fireEvent.change(screen.getByTestId("expiry-input"), {
      target: { value: "2099-06-16" },
    });
    fireEvent.change(screen.getByTestId("expiry-input"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("get-quote-btn"));

    await waitFor(() => {
      expect(getQuote).toHaveBeenCalled();
    });
    const arg = getQuote.mock.calls[0][0];
    expect(arg.expirySecs).toBeGreaterThan(0);
  });

  it("computes put-option sensitivity data with negative deltas", async () => {
    render(<OptionPricingPanel />);

    fireEvent.click(screen.getByTestId("put-btn"));
    fireEvent.click(screen.getByTestId("get-quote-btn"));

    await screen.findByTestId("quote-result");
    expect(screen.getByText(/Greeks vs Spot/i)).toBeInTheDocument();
  });

  it("renders a degenerate quote without throwing on zero-vol greeks", async () => {
    getQuote.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          symbol: "AAPL",
          optionType: "call",
          strike: 150,
          expirySecs: 0,
          spotPrice: 150.25,
          impliedVol: 0,
          price: 0,
          greeks: { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
          computedAt: Date.now(),
        }),
    });

    render(<OptionPricingPanel />);
    fireEvent.change(screen.getByTestId("strike-input"), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByTestId("get-quote-btn"));

    expect(await screen.findByTestId("quote-result")).toBeInTheDocument();
  });
});
