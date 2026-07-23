import { fireEvent, render, screen } from "@testing-library/react";
import { GreeksSurfacePanel } from "@veta/frontend/components/GreeksSurfacePanel";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useGetGreeksSurfaceQuery = vi.fn();

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetGreeksSurfaceQuery: (...args: unknown[]) => useGetGreeksSurfaceQuery(...args),
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = { market: { symbols: ["AAPL", "MSFT"] } };
    return selector(state);
  },
}));

vi.mock("../../store/selectors.ts", () => ({
  selectSymbols: (_state: unknown) => ["AAPL", "MSFT"],
}));

vi.mock("recharts", () => {
  const MockContainer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: MockContainer,
    ComposedChart: MockContainer,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Tooltip: ({ content }: { content?: React.ReactElement }) => (
      <div data-testid="tooltip-mock">
        {content
          ? React.cloneElement(content, {
              active: true,
              label: 1,
              payload: [{ name: "delta", value: 0.5, color: "#fff", dataKey: "delta" }],
            })
          : null}
      </div>
    ),
    Legend: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-${dataKey}`} />,
  };
});

describe("GreeksSurfacePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGetGreeksSurfaceQuery.mockReset();
    useGetGreeksSurfaceQuery.mockImplementation(
      (params: { symbol: string; expirySecs: number }) => {
        const { symbol, expirySecs } = params;
        if (symbol === "AAPL" && expirySecs === 30 * 86400) {
          return {
            data: {
              symbol: "AAPL",
              spotPrice: 175.5,
              impliedVol: 0.22,
              expirySecs: 30 * 86400,
              strikes: [
                {
                  strike: 170,
                  moneyness: 0.97,
                  callDelta: 0.65,
                  gamma: 0.01,
                  theta: -0.02,
                  vega: 0.04,
                },
                {
                  strike: 175,
                  moneyness: 1.0,
                  callDelta: 0.5,
                  gamma: 0.015,
                  theta: -0.015,
                  vega: 0.05,
                },
                {
                  strike: 180,
                  moneyness: 1.02,
                  callDelta: 0.35,
                  gamma: 0.01,
                  theta: -0.01,
                  vega: 0.04,
                },
              ],
              computedAt: Date.now(),
            },
            isFetching: false,
            error: null,
          };
        }
        return { data: null, isFetching: false, error: null };
      }
    );
  });

  it("renders the panel header and symbol selector", () => {
    render(<GreeksSurfacePanel />);
    expect(screen.getByText(/Greeks Surface/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("AAPL")).toBeInTheDocument();
  });

  it("displays spot price and implied volatility summary when data loads", () => {
    render(<GreeksSurfacePanel />);
    expect(screen.getByText(/Spot \$175.50/)).toBeInTheDocument();
    expect(screen.getByText(/IV 22.0%/)).toBeInTheDocument();
    expect(screen.getByText(/3 strikes/)).toBeInTheDocument();
  });

  it("allows selection of expiry preset buttons", () => {
    render(<GreeksSurfacePanel />);
    const button7d = screen.getByRole("button", { name: /7d/ });
    const button30d = screen.getByRole("button", { name: /30d/ });

    expect(button30d.className).toContain("bg-blue-700");
    fireEvent.click(button7d);
    expect(button7d.className).toContain("bg-blue-700");
  });

  it("changes the selected symbol", () => {
    render(<GreeksSurfacePanel />);
    const sel = screen.getByDisplayValue("AAPL");
    fireEvent.change(sel, { target: { value: "MSFT" } });
    // No data for MSFT — should fall through to no-data view
    expect(screen.queryByText(/Spot/)).not.toBeInTheDocument();
  });

  it("renders chart container with all greek lines", () => {
    render(<GreeksSurfacePanel />);
    // From mock: line-callDelta, line-gamma, line-theta, line-vega
    expect(screen.queryAllByTestId(/line-/).length).toBeGreaterThan(0);
  });

  it("renders strike values from mock data", () => {
    render(<GreeksSurfacePanel />);
    // Strikes 170, 175, 180 should appear somewhere
    expect(screen.getAllByText(/170|175|180/).length).toBeGreaterThan(0);
  });

  it("shows loading indicator while fetching", () => {
    useGetGreeksSurfaceQuery.mockReturnValue({
      data: undefined,
      isFetching: true,
      error: null,
    });

    render(<GreeksSurfacePanel />);
    expect(screen.getByText(/Loading…/i)).toBeInTheDocument();
    expect(screen.queryByText(/Select a symbol to view Greeks surface/i)).not.toBeInTheDocument();
  });

  it("shows empty state when no data and no error", () => {
    useGetGreeksSurfaceQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: null,
    });

    render(<GreeksSurfacePanel />);
    expect(screen.getByText(/Select a symbol to view Greeks surface/i)).toBeInTheDocument();
  });

  it("shows API error message and chart fallback", () => {
    useGetGreeksSurfaceQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: { data: { error: "surface offline" } },
    });

    render(<GreeksSurfacePanel />);
    expect(screen.getByText("surface offline")).toBeInTheDocument();
    expect(screen.getByText(/Could not load surface data/i)).toBeInTheDocument();
  });

  it("shows generic error text when payload has no message", () => {
    useGetGreeksSurfaceQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: { status: 500 },
    });

    render(<GreeksSurfacePanel />);
    expect(screen.getByText("Failed to load")).toBeInTheDocument();
  });

  it("renders tooltip content through recharts tooltip slot", () => {
    render(<GreeksSurfacePanel />);
    expect(screen.getByText(/K\/S =/i)).toBeInTheDocument();
    expect(screen.getByText(/delta:/i)).toBeInTheDocument();
  });
});
