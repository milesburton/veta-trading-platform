import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchRadarPanel } from "../ResearchRadarPanel";

const broadcast = vi.fn();
let mockState: {
  intelligence: {
    signals: Record<string, unknown>;
    features: Record<string, unknown>;
  };
} = {
  intelligence: { signals: {}, features: {} },
};

vi.mock("recharts", () => {
  const Mock = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Scatter = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );

  return {
    ResponsiveContainer: Mock,
    ScatterChart: Mock,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    ZAxis: () => null,
    Cell: () => null,
    Scatter,
  };
});

vi.mock("../../hooks/useChannelOut.ts", () => ({
  useChannelOut: () => broadcast,
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(mockState),
}));

describe("ResearchRadarPanel", () => {
  beforeEach(() => {
    broadcast.mockReset();
    mockState = {
      intelligence: {
        signals: {},
        features: {},
      },
    };
  });

  it("shows waiting state when no signal data", () => {
    render(<ResearchRadarPanel />);

    expect(screen.getByText(/Waiting for signal data/i)).toBeInTheDocument();
  });

  it("renders sorted rows, filters, and broadcasts selected symbol", () => {
    mockState = {
      intelligence: {
        signals: {
          AAPL: {
            symbol: "AAPL",
            score: 0.7,
            confidence: 0.9,
            direction: "long",
          },
          TSLA: {
            symbol: "TSLA",
            score: -0.5,
            confidence: 0.8,
            direction: "short",
          },
          MSFT: {
            symbol: "MSFT",
            score: 0.1,
            confidence: 0.7,
            direction: "neutral",
          },
        },
        features: {
          AAPL: { newsVelocity: 2.2 },
          TSLA: { newsVelocity: 1.1 },
          MSFT: { newsVelocity: 0.2 },
        },
      },
    };

    render(<ResearchRadarPanel />);

    expect(screen.getByText(/Signal Radar/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /All \(3\)/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Short \(1\)/i }));
    expect(screen.queryByText("AAPL")).not.toBeInTheDocument();
    expect(screen.getByText("TSLA")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /All \(3\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /News/i }));

    fireEvent.click(screen.getByText("AAPL"));
    expect(broadcast).toHaveBeenCalledWith({ selectedAsset: "AAPL" });
  });
});
