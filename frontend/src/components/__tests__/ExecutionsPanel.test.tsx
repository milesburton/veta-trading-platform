import { fireEvent, render, screen } from "@testing-library/react";
import { ExecutionsPanel } from "@veta/frontend/components/ExecutionsPanel";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("renders an order with multiple child fills", () => {
    rows = [
      {
        id: "o-4",
        submittedAt: Date.now(),
        asset: "AAPL",
        side: "BUY",
        strategy: "TWAP",
        status: "working",
        quantity: 200,
        filled: 100,
        limitPrice: 150,
        children: [
          {
            id: "ch1",
            parentId: "o-4",
            asset: "AAPL",
            side: "BUY",
            quantity: 50,
            limitPrice: 150,
            status: "filled",
            filled: 50,
            avgFillPrice: 150,
            commissionUSD: 0.25,
            submittedAt: Date.now(),
            venue: "NASDAQ" as never,
            counterparty: "MM-1",
            liquidityFlag: "MAKER" as never,
          },
          {
            id: "ch2",
            parentId: "o-4",
            asset: "AAPL",
            side: "BUY",
            quantity: 50,
            limitPrice: 151,
            status: "filled",
            filled: 50,
            avgFillPrice: 151,
            commissionUSD: 0.25,
            submittedAt: Date.now(),
            venue: "NYSE" as never,
            counterparty: "MM-2",
            liquidityFlag: "TAKER" as never,
          },
        ],
      },
    ];

    render(<ExecutionsPanel />);
    fireEvent.click(screen.getByTestId("execution-row"));
    // detail panel should render
    expect(screen.queryByText(/No fills recorded/i)).not.toBeInTheDocument();
  });

  it("renders order with high adverse impact", () => {
    rows = [
      {
        id: "o-impact",
        submittedAt: Date.now(),
        asset: "AAPL",
        side: "BUY" as const,
        strategy: "TWAP",
        status: "working",
        quantity: 100,
        filled: 100,
        limitPrice: 100,
        children: [
          {
            id: "ch-imp1",
            parentId: "o-impact",
            asset: "AAPL",
            side: "BUY",
            quantity: 100,
            limitPrice: 100,
            status: "filled",
            filled: 100,
            avgFillPrice: 105,
            commissionUSD: 0.5,
            liquidityFlag: "TAKER",
            submittedAt: Date.now(),
          },
        ],
      },
    ];
    render(<ExecutionsPanel />);
    fireEvent.click(screen.getByTestId("execution-row"));
    expect(screen.queryByText(/No fills recorded/i)).not.toBeInTheDocument();
  });

  it("renders order with negative impact (favourable)", () => {
    rows = [
      {
        id: "o-fav",
        submittedAt: Date.now(),
        asset: "MSFT",
        side: "SELL" as const,
        strategy: "POV",
        status: "working",
        quantity: 50,
        filled: 50,
        limitPrice: 200,
        children: [
          {
            id: "ch-fav1",
            parentId: "o-fav",
            asset: "MSFT",
            side: "SELL",
            quantity: 50,
            limitPrice: 200,
            status: "filled",
            filled: 50,
            avgFillPrice: 205, // selling above limit (favourable)
            commissionUSD: -0.1, // maker rebate
            liquidityFlag: "MAKER",
            submittedAt: Date.now(),
          },
        ],
      },
    ];
    render(<ExecutionsPanel />);
    fireEvent.click(screen.getByTestId("execution-row"));
    expect(screen.queryByText(/No fills recorded/i)).not.toBeInTheDocument();
  });

  it("renders expired order", () => {
    rows = [
      {
        id: "o-exp",
        submittedAt: Date.now(),
        asset: "AAPL",
        side: "BUY" as const,
        strategy: "TWAP",
        status: "expired",
        quantity: 100,
        filled: 0,
        limitPrice: 150,
        children: [],
      },
    ];
    render(<ExecutionsPanel />);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
  });

  it("renders filled SELL order", () => {
    rows = [
      {
        id: "o-5",
        submittedAt: Date.now(),
        asset: "TSLA",
        side: "SELL",
        strategy: "POV",
        status: "filled",
        quantity: 100,
        filled: 100,
        limitPrice: 200,
        children: [
          {
            id: "ch3",
            parentId: "o-5",
            asset: "TSLA",
            side: "SELL",
            quantity: 100,
            limitPrice: 200,
            status: "filled",
            filled: 100,
            avgFillPrice: 199.5,
            commissionUSD: 0.5,
            submittedAt: Date.now(),
          },
        ],
      },
    ];
    render(<ExecutionsPanel />);
    expect(screen.getByText("TSLA")).toBeInTheDocument();
    expect(screen.getByText("SELL")).toBeInTheDocument();
  });
});
