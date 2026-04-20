import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChildOrdersPanel } from "../ChildOrdersPanel";

const broadcast = vi.fn();
let selectedOrderId: string | null = "parent-1";
let rows: unknown[] = [];

vi.mock("../../contexts/ChannelContext.tsx", () => ({
  useChannelContext: () => ({ incoming: null, outgoing: null }),
}));

vi.mock("../../hooks/useChannelIn.ts", () => ({
  useChannelIn: () => ({ selectedOrderId }),
}));

vi.mock("../../hooks/useChannelOut.ts", () => ({
  useChannelOut: () => broadcast,
}));

vi.mock("../../hooks/useColumnLayout.ts", () => ({
  useColumnLayout: () => ({
    orderedCols: [
      { key: "time", label: "Time" },
      { key: "status", label: "Status" },
    ],
    getWidth: () => 90,
    onResize: () => {},
    onReorder: () => {},
  }),
}));

vi.mock("../../store/gridApi.ts", () => ({
  useQueryGridQuery: () => ({ data: { rows } }),
}));

vi.mock("../grid/ResizableHeader.tsx", () => ({
  ResizableHeader: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
}));

describe("ChildOrdersPanel", () => {
  beforeEach(() => {
    broadcast.mockReset();
    selectedOrderId = "parent-1";
    rows = [];
  });

  it("shows guidance when no parent order is selected", () => {
    selectedOrderId = null;
    render(<ChildOrdersPanel />);

    expect(screen.getByText(/Link an incoming channel/i)).toBeInTheDocument();
  });

  it("shows empty child state when parent has no children", () => {
    rows = [
      {
        id: "parent-1",
        asset: "AAPL",
        side: "BUY",
        quantity: 1000,
        children: [],
      },
    ];

    render(<ChildOrdersPanel />);

    expect(screen.getByText(/AAPL BUY 1000/i)).toBeInTheDocument();
    expect(screen.getByText(/No execution slices yet/i)).toBeInTheDocument();
  });

  it("renders child rows and broadcasts selected child id", () => {
    rows = [
      {
        id: "parent-1",
        asset: "AAPL",
        side: "BUY",
        quantity: 1000,
        children: [
          {
            id: "child-1-abcdef123456",
            submittedAt: Date.now(),
            quantity: 100,
            avgFillPrice: 150.12,
            limitPrice: 150.1,
            filled: 100,
            venue: "XNAS",
            status: "filled",
            counterparty: "MM1",
            liquidityFlag: "MAKER",
            commissionUSD: 0.5,
            settlementDate: "T+2",
          },
        ],
      },
    ];

    render(<ChildOrdersPanel />);

    expect(screen.getByText(/filled/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/filled/i));

    expect(broadcast).toHaveBeenCalledWith({
      selectedOrderId: "child-1-abcdef123456",
    });
  });
});
