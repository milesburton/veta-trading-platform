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

  it("shows loading placeholders while sessions and executions are still fetching", () => {
    state.sessionsLoading = true;
    state.executionsLoading = true;
    render(<FixSessionsPanel />);
    const loading = screen.getAllByText("Loading…");
    expect(loading.length).toBe(2);
  });

  it("does not show the loading placeholder once data has arrived, even if isLoading is still true", () => {
    state.sessionsLoading = true;
    state.sessions = [
      {
        remote: "10.0.0.5:51000",
        counterparty: "ACME",
        state: "ACTIVE",
        connectedAt: Date.now(),
        openOrders: 0,
      },
    ];
    render(<FixSessionsPanel />);
    expect(screen.queryByText("No FIX sessions connected")).not.toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("renders a non-ACTIVE session with the pending/amber styling and shows '(pending logon)' with no counterparty", () => {
    state.sessions = [
      {
        remote: "10.0.0.6:51001",
        counterparty: null,
        state: "LOGON_SENT",
        connectedAt: Date.now(),
        openOrders: 0,
      },
    ];
    render(<FixSessionsPanel />);
    expect(screen.getByText("LOGON_SENT")).toBeInTheDocument();
    expect(screen.getByText("(pending logon)")).toBeInTheDocument();
  });

  it("renders a SELL execution and a non-BUY/SELL side falls back to the raw code", () => {
    state.executions = [
      {
        execId: "EX2",
        clOrdId: "CL2",
        origClOrdId: null,
        symbol: "MSFT",
        side: "2",
        execType: "2",
        ordStatus: "1",
        leavesQty: 50,
        cumQty: 50,
        avgPx: 0,
        lastQty: 50,
        lastPx: 400,
        venue: "FIX-EXCHANGE",
        counterparty: null,
        commission: null,
        settlDate: null,
        account: null,
        transactTime: "20260816-10:00:00",
        ts: Date.now(),
      },
    ];
    render(<FixSessionsPanel />);
    expect(screen.getByText("SELL")).toBeInTheDocument();
    expect(screen.getByText("Partial")).toBeInTheDocument();
    // avgPx of 0 and a null counterparty both render the em-dash placeholder
    expect(screen.getAllByText("—").length).toBe(2);
  });

  it("falls back to the raw ordStatus code when it isn't in the known label map", () => {
    state.executions = [
      {
        execId: "EX3",
        clOrdId: "CL3",
        origClOrdId: null,
        symbol: "AAPL",
        side: "1",
        execType: "9",
        ordStatus: "C",
        leavesQty: 0,
        cumQty: 0,
        avgPx: 0,
        lastQty: 0,
        lastPx: 0,
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
    expect(screen.getByText("C")).toBeInTheDocument();
  });
});
