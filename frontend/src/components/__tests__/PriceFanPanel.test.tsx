import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PriceFanPanel } from "../PriceFanPanel";

const useGetPriceFanQuery = vi.fn();

vi.mock("../../store/analyticsApi.ts", () => ({
  useGetPriceFanQuery: (...args: unknown[]) => useGetPriceFanQuery(...args),
}));

describe("PriceFanPanel", () => {
  beforeEach(() => {
    useGetPriceFanQuery.mockReset();
    useGetPriceFanQuery.mockReturnValue({
      data: {
        spotPrice: 100,
        impliedVol: 0.24,
        steps: [
          { tSecs: 3600, p5: 90, p25: 95, p50: 100, p75: 105, p95: 110 },
          { tSecs: 7200, p5: 88, p25: 94, p50: 101, p75: 107, p95: 113 },
        ],
      },
      isFetching: false,
      isError: false,
    });
  });

  it("renders summary footer and horizon controls", () => {
    render(<PriceFanPanel />);

    expect(screen.getByText(/Price Fan/i)).toBeInTheDocument();
    expect(screen.getByText(/Vol: 24.0%/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1d" })).toBeInTheDocument();
    expect(screen.getByText(/500 paths/i)).toBeInTheDocument();
  });

  it("submits symbol change and horizon change through query args", () => {
    render(<PriceFanPanel />);

    fireEvent.change(screen.getByPlaceholderText(/AAPL/i), {
      target: { value: "msft" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Go/i }));
    fireEvent.click(screen.getByRole("button", { name: "1w" }));

    const args = useGetPriceFanQuery.mock.calls.map((call) => call[0]);
    expect(args).toContainEqual({ symbol: "AAPL", steps: 24, stepSecs: 3600 });
    expect(args).toContainEqual({ symbol: "MSFT", steps: 24, stepSecs: 3600 });
    expect(args).toContainEqual({ symbol: "MSFT", steps: 7, stepSecs: 86400 });
  });

  it("shows no-data and error states", () => {
    useGetPriceFanQuery
      .mockReturnValueOnce({
        data: { spotPrice: 0, impliedVol: 0, steps: [] },
        isFetching: false,
        isError: false,
      })
      .mockReturnValueOnce({
        data: undefined,
        isFetching: false,
        isError: true,
      });

    const { rerender } = render(<PriceFanPanel />);
    expect(screen.getByText(/No data for AAPL/i)).toBeInTheDocument();

    rerender(<PriceFanPanel />);
    expect(screen.getByText(/Failed to load fan data for AAPL/i)).toBeInTheDocument();
  });
});
