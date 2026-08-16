import { render, screen } from "@testing-library/react";
import { FixSessionsPanel } from "@veta/frontend/components/FixSessionsPanel";
import type { FixExecution, FixSessionInfo } from "@veta/frontend/store/fixApi";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  sessions: FixSessionInfo[];
  sessionsLoading: boolean;
  executions: FixExecution[];
  executionsLoading: boolean;
} = {
  sessions: [],
  sessionsLoading: false,
  executions: [],
  executionsLoading: false,
};

vi.mock("../../store/fixApi.ts", () => ({
  useGetFixSessionsQuery: () => ({
    data: { sessions: state.sessions },
    isLoading: state.sessionsLoading,
  }),
  useGetFixExecutionsQuery: () => ({
    data: state.executions,
    isLoading: state.executionsLoading,
  }),
}));

vi.mock("../PopOutButton.tsx", () => ({
  PopOutButton: () => <button type="button">Pop Out</button>,
}));

describe("FixSessionsPanel", () => {
  beforeEach(() => {
    state.sessions = [];
    state.sessionsLoading = false;
    state.executions = [];
    state.executionsLoading = false;
  });

  it("renders the panel header", () => {
    render(<FixSessionsPanel />);
    expect(screen.getByText("FIX Sessions")).toBeInTheDocument();
  });

  it("shows empty states when nothing is connected or archived", () => {
    render(<FixSessionsPanel />);
    expect(screen.getByText("No FIX sessions connected")).toBeInTheDocument();
    expect(screen.getByText("No FIX executions recorded")).toBeInTheDocument();
  });

  it("renders a connected session and a recorded execution", () => {
    state.sessions = [
      {
        remote: "10.0.0.5:51000",
        counterparty: "ACME",
        state: "ACTIVE",
        connectedAt: Date.now() - 60_000,
        openOrders: 2,
      },
    ];
    state.executions = [
      {
        execId: "EX1",
        clOrdId: "CL1",
        origClOrdId: null,
        symbol: "AAPL",
        side: "1",
        execType: "2",
        ordStatus: "2",
        leavesQty: 0,
        cumQty: 100,
        avgPx: 190.5,
        lastQty: 100,
        lastPx: 190.5,
        venue: "FIX-EXCHANGE",
        counterparty: "ACME",
        commission: null,
        settlDate: null,
        account: null,
        transactTime: "20260816-10:00:00",
        ts: Date.now(),
      },
    ];

    render(<FixSessionsPanel />);

    expect(screen.getAllByText("ACME").length).toBeGreaterThan(0);
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("BUY")).toBeInTheDocument();
    expect(screen.getByText("Filled")).toBeInTheDocument();
  });
});
