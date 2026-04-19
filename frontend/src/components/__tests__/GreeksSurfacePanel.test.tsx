import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GreeksSurfacePanel } from "../GreeksSurfacePanel";

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetGreeksSurfaceQuery: (params: { symbol: string; expirySecs: number }) => {
    const { symbol, expirySecs } = params;
    if (symbol === "AAPL" && expirySecs === 30 * 86400) {
      return {
        data: {
          symbol: "AAPL",
          spotPrice: 175.5,
          impliedVol: 0.22,
          expirySecs: 30 * 86400,
          strikes: [
            { strike: 170, moneyness: 0.97, callDelta: 0.65, gamma: 0.01, theta: -0.02, vega: 0.04 },
            { strike: 175, moneyness: 1.0, callDelta: 0.5, gamma: 0.015, theta: -0.015, vega: 0.05 },
            { strike: 180, moneyness: 1.02, callDelta: 0.35, gamma: 0.01, theta: -0.01, vega: 0.04 },
          ],
          computedAt: Date.now(),
        },
        isFetching: false,
        error: null,
      };
    }
    return { data: null, isFetching: false, error: null };
  },
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
    Tooltip: () => null,
    Legend: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Line: ({ dataKey }: { dataKey: string }) => <div data-testid={`line-${dataKey}`} />,
  };
});

describe("GreeksSurfacePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
