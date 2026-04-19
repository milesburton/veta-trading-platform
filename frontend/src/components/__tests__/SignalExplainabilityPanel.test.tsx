import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignalExplainabilityPanel } from "../SignalExplainabilityPanel";

let mockChannelData: { selectedAsset: string } | null = { selectedAsset: "AAPL" };

vi.mock("../../hooks/useChannelIn.ts", () => ({
  useChannelIn: () => mockChannelData ?? { selectedAsset: "" },
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      intelligence: {
        signals: {
          AAPL: {
            score: 0.75,
            direction: "long",
            confidence: 0.8,
            factors: [
              { name: "momentum", contribution: 0.3, weight: 1.0 },
              { name: "sentimentDelta", contribution: 0.25, weight: 1.0 },
              { name: "newsVelocity", contribution: 0.2, weight: 1.0 },
              { name: "relativeVolume", contribution: 0.15, weight: 1.0 },
              { name: "realisedVol", contribution: -0.05, weight: 1.0 },
            ],
          },
        },
      },
    };
    return selector(state);
  },
}));

describe("SignalExplainabilityPanel", () => {
  beforeEach(() => {
    mockChannelData = { selectedAsset: "AAPL" };
    vi.clearAllMocks();
  });

  it("renders the symbol and signal score in header", () => {
    render(<SignalExplainabilityPanel />);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText(/score \+0.750/)).toBeInTheDocument();
  });

  it("shows the signal direction as long or short", () => {
    render(<SignalExplainabilityPanel />);
    expect(screen.getByText("long")).toBeInTheDocument();
  });

  it("displays factor contributions in descending order", () => {
    render(<SignalExplainabilityPanel />);
    expect(screen.getByText(/Momentum/)).toBeInTheDocument();
    expect(screen.getByText(/Sent. Delta/)).toBeInTheDocument();
    expect(screen.getByText(/News Vel/)).toBeInTheDocument();
    expect(screen.getByText(/Realised Vol/)).toBeInTheDocument();
  });

  it("shows empty state when no channel asset is selected", () => {
    mockChannelData = { selectedAsset: "" };
    render(<SignalExplainabilityPanel />);
    expect(screen.getByText(/waiting for symbol selection/i)).toBeInTheDocument();
  });

  it("shows no signal state when signal data is missing", () => {
    mockChannelData = { selectedAsset: "TSLA" };
    render(<SignalExplainabilityPanel />);
    expect(screen.getByText(/No signal data for TSLA/i)).toBeInTheDocument();
  });
});
