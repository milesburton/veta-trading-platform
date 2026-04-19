import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstrumentAnalysisPanel } from "../InstrumentAnalysisPanel";

let selectedAsset = "";
let appState: any = {
  intelligence: {
    signals: {},
    features: {},
  },
};

vi.mock("recharts", () => {
  const Mock = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Mock,
    ComposedChart: Mock,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Line: () => null,
  };
});

vi.mock("../../hooks/useChannelIn.ts", () => ({
  useChannelIn: () => ({ selectedAsset }),
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector(appState),
}));

vi.mock("../AdvisoryPanel.tsx", () => ({
  AdvisoryPanel: ({ symbol }: { symbol: string }) => (
    <div>advisory-{symbol}</div>
  ),
}));

describe("InstrumentAnalysisPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    selectedAsset = "";
    appState = {
      intelligence: {
        signals: {},
        features: {},
      },
    };
  });

  it("shows waiting state when no symbol is selected", () => {
    render(<InstrumentAnalysisPanel />);

    expect(
      screen.getByText(/waiting for symbol selection/i),
    ).toBeInTheDocument();
  });

  it("renders signal/features and backtest frames", async () => {
    selectedAsset = "AAPL";
    appState = {
      intelligence: {
        signals: {
          AAPL: { score: 0.42, direction: "long", confidence: 0.91 },
        },
        features: {
          AAPL: {
            momentum: 1.2,
            relativeVolume: 0.8,
            realisedVol: 0.3,
            sectorRelativeStrength: 0.5,
            eventScore: 0.1,
            newsVelocity: 2.2,
            sentimentDelta: 0.2,
          },
          MSFT: {
            momentum: 0.5,
            relativeVolume: 1.1,
            realisedVol: 0.6,
            sectorRelativeStrength: 0.4,
            eventScore: 0.2,
            newsVelocity: 0.9,
            sentimentDelta: 0.1,
          },
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            ts: Date.now() - 1_000,
            close: 190.5,
            signal: { score: 0.2, direction: "long", confidence: 0.8 },
          },
          {
            ts: Date.now(),
            close: 191.2,
            signal: { score: 0.4, direction: "long", confidence: 0.9 },
          },
        ]),
        { status: 200 },
      ),
    );

    render(<InstrumentAnalysisPanel />);

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText(/Features/i)).toBeInTheDocument();
    expect(screen.getByText(/advisory-AAPL/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Run Backtest/i }));
    expect(await screen.findByText(/2 frames/i)).toBeInTheDocument();
  });

  it("shows replay error when backtest request fails", async () => {
    selectedAsset = "TSLA";
    appState = {
      intelligence: {
        signals: { TSLA: { score: -0.2, direction: "short", confidence: 0.7 } },
        features: { TSLA: { momentum: 0.1 } },
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 500 }),
    );

    render(<InstrumentAnalysisPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Run Backtest/i }));

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
