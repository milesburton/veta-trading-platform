import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutionsPanel } from "../ExecutionsPanel";

let incomingChannel: unknown = null;
let channelIn = {
  selectedOrderId: null as string | null,
  selectedAsset: null as string | null,
};
let rows: unknown[] = [];

vi.mock("recharts", () => {
  const Mock = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Mock,
    LineChart: Mock,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Line: () => null,
  };
});

vi.mock("../../contexts/ChannelContext.tsx", () => ({
  useChannelContext: () => ({ incoming: incomingChannel }),
}));

vi.mock("../../hooks/useChannelIn.ts", () => ({
  useChannelIn: () => channelIn,
}));

vi.mock("../../hooks/useGridQuery.ts", () => ({
  useContainerLimit: () => ({ containerRef: { current: null }, limit: 20 }),
  useGridQuery: () => ({ rows, total: rows.length, isLoading: false }),
}));

vi.mock("../../hooks/useColumnLayout.ts", () => ({
  useColumnLayout: () => ({
    orderedCols: [
      { key: "submittedAt", label: "Time" },
      { key: "asset", label: "Asset" },
      { key: "side", label: "Side" },
      { key: "status", label: "Status" },
      { key: "fillPct", label: "Fill%", align: "right" },
      { key: "impact", label: "Impact", align: "right" },
      { key: "commission", label: "Comm", align: "right" },
      { key: "slices", label: "Slices", align: "right" },
      { key: "_expand", label: "" },
    ],
    getWidth: () => 90,
    onResize: () => {},
    onReorder: () => {},
  }),
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ gridPrefs: { executions: { cfRules: [] } } }),
}));

vi.mock("../grid/FilterBar.tsx", () => ({
  FilterBar: () => <div>filter-bar</div>,
}));
vi.mock("../grid/CfRuleEditor.tsx", () => ({
  CfRuleEditor: () => <div>cf-editor</div>,
}));
vi.mock("../grid/ResizableHeader.tsx", () => ({
  ResizableHeader: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
}));
vi.mock("../PopOutButton.tsx", () => ({
  PopOutButton: () => <button type="button">pop</button>,
}));

describe("ExecutionsPanel", () => {
  beforeEach(() => {
    incomingChannel = null;
    channelIn = { selectedOrderId: null, selectedAsset: null };
    rows = [];
  });

  it("renders empty state when there are no executions", () => {
    render(<ExecutionsPanel />);

    expect(screen.getByTestId("executions-panel")).toBeInTheDocument();
    expect(screen.getByText(/No executions yet/i)).toBeInTheDocument();
  });

  it("filters executions by selected asset from channel", () => {
    incomingChannel = { id: "in-1" };
    channelIn = { selectedOrderId: null, selectedAsset: "AAPL" };
    rows = [
      {
        id: "o-1",
        submittedAt: Date.now(),
        asset: "AAPL",
        side: "BUY",
        strategy: "TWAP",
        status: "working",
        quantity: 100,
        filled: 20,
        limitPrice: 100,
        children: [],
      },
      {
        id: "o-2",
        submittedAt: Date.now(),
        asset: "TSLA",
        side: "SELL",
        strategy: "TWAP",
        status: "working",
        quantity: 100,
        filled: 10,
        limitPrice: 200,
        children: [],
      },
    ];

    render(<ExecutionsPanel />);

    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(screen.queryByText("TSLA")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("expands a row and shows no-fills detail", () => {
    rows = [
      {
        id: "o-3",
        submittedAt: Date.now(),
        asset: "MSFT",
        side: "BUY",
        strategy: "VWAP",
        status: "working",
        quantity: 100,
        filled: 0,
        limitPrice: 300,
        children: [],
      },
    ];

    render(<ExecutionsPanel />);

    fireEvent.click(screen.getByTestId("execution-row"));
    expect(screen.getByText(/No fills recorded/i)).toBeInTheDocument();
  });
});
