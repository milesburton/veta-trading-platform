import { fireEvent, render, screen } from "@testing-library/react";
import { LoadGenPanel } from "@veta/frontend/components/LoadGenPanel";
import { beforeEach, describe, expect, it, vi } from "vitest";

const startMutation = vi.fn();
const stopMutation = vi.fn();
const refetch = vi.fn();
let mockRole: string | undefined = "admin";
let mockStatus: {
  running: boolean;
  ordersSent?: number;
  ordersFailed?: number;
  startedAt?: number;
  stopAt?: number;
  config?: { ratePerSecond: number };
  lastError?: string | null;
} = { running: false };

vi.mock("../../store/gatewayApi.ts", () => ({
  useGetLoadGenStatusQuery: () => ({
    data: mockStatus,
    refetch,
  }),
  useStartLoadGenMutation: () => [startMutation, { isLoading: false }],
  useStopLoadGenMutation: () => [stopMutation, { isLoading: false }],
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      auth: {
        user: mockRole ? { id: "u1", role: mockRole, name: "Test", avatar_emoji: "✅" } : null,
      },
      market: {
        assets: [
          { symbol: "AAPL", dailyVolume: 55_000_000, assetClass: "equity" },
          { symbol: "MSFT", dailyVolume: 20_000_000, assetClass: "equity" },
          { symbol: "GOOGL", dailyVolume: 25_000_000, assetClass: "equity" },
          { symbol: "AMZN", dailyVolume: 35_000_000, assetClass: "equity" },
          { symbol: "META", dailyVolume: 18_000_000, assetClass: "equity" },
          { symbol: "NVDA", dailyVolume: 45_000_000, assetClass: "equity" },
          { symbol: "TSLA", dailyVolume: 70_000_000, assetClass: "equity" },
          { symbol: "JPM", dailyVolume: 11_000_000, assetClass: "equity" },
          { symbol: "V", dailyVolume: 8_000_000, assetClass: "equity" },
          { symbol: "WMT", dailyVolume: 9_000_000, assetClass: "equity" },
        ],
      },
    };
    return selector(state);
  },
}));

describe("LoadGenPanel", () => {
  beforeEach(() => {
    startMutation.mockReset();
    stopMutation.mockReset();
    refetch.mockReset();
    startMutation.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    stopMutation.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    mockRole = "admin";
    mockStatus = { running: false };
  });

  it("denies access for non-admin / non-oncall roles", () => {
    mockRole = "trader";
    render(<LoadGenPanel />);
    expect(screen.getByText(/Admin or oncall access required/i)).toBeInTheDocument();
  });

  it("denies access when no user is signed in", () => {
    mockRole = undefined;
    render(<LoadGenPanel />);
    expect(screen.getByText(/Admin or oncall access required/i)).toBeInTheDocument();
  });

  it("allows oncall role", () => {
    mockRole = "oncall";
    render(<LoadGenPanel />);
    expect(screen.queryByText(/Admin or oncall access required/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("load-gen-start")).toBeInTheDocument();
  });

  it("renders config form when not running", () => {
    render(<LoadGenPanel />);
    expect(screen.getByTestId("load-gen-rate-input")).toBeInTheDocument();
    expect(screen.getByTestId("load-gen-symbols-input")).toBeInTheDocument();
    expect(screen.getByTestId("load-gen-sizemin-input")).toBeInTheDocument();
    expect(screen.getByTestId("load-gen-sizemax-input")).toBeInTheDocument();
    expect(screen.getByTestId("load-gen-start")).toBeInTheDocument();
  });

  it("calls start mutation with config when Start clicked", async () => {
    render(<LoadGenPanel />);
    fireEvent.click(screen.getByTestId("load-gen-start"));
    await Promise.resolve();
    expect(startMutation).toHaveBeenCalledTimes(1);
    const arg = startMutation.mock.calls[0][0];
    expect(arg).toMatchObject({
      ratePerSecond: 50,
      autoStopAfterMs: 60 * 60_000,
      sizeMin: 100,
      sizeMax: 5_000,
    });
    expect(arg.symbols).toEqual(expect.arrayContaining(["AAPL", "MSFT", "GOOGL"]));
  });

  it("selects rate preset on click", () => {
    render(<LoadGenPanel />);
    fireEvent.click(screen.getByTestId("load-gen-rate-250"));
    const input = screen.getByTestId("load-gen-rate-input") as HTMLInputElement;
    expect(input.value).toBe("250");
  });

  it("selects auto-stop preset on click", () => {
    render(<LoadGenPanel />);
    fireEvent.click(screen.getByTestId("load-gen-autostop-15min"));
    expect(screen.getByTestId("load-gen-autostop-15min").className).toContain("emerald");
  });

  it("updates rate via numeric input", () => {
    render(<LoadGenPanel />);
    const input = screen.getByTestId("load-gen-rate-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "175" } });
    expect(input.value).toBe("175");
  });

  it("updates symbols via text input", () => {
    render(<LoadGenPanel />);
    const input = screen.getByTestId("load-gen-symbols-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "TSLA, NVDA" } });
    expect(input.value).toBe("TSLA, NVDA");
  });

  it("trims and uppercases symbols when starting", async () => {
    render(<LoadGenPanel />);
    const input = screen.getByTestId("load-gen-symbols-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  tsla, nvda ,  ,aapl" } });
    fireEvent.click(screen.getByTestId("load-gen-start"));
    await Promise.resolve();
    expect(startMutation.mock.calls[0][0].symbols).toEqual(["TSLA", "NVDA", "AAPL"]);
  });

  it("renders running status with stats and stop button when running", () => {
    mockStatus = {
      running: true,
      ordersSent: 1234,
      ordersFailed: 5,
      startedAt: Date.now() - 60_000,
      stopAt: Date.now() + 60_000,
      config: { ratePerSecond: 100 },
      lastError: null,
    };
    render(<LoadGenPanel />);
    expect(screen.getByTestId("load-gen-running-badge")).toBeInTheDocument();
    expect(screen.getByTestId("load-gen-orders-sent")).toHaveTextContent("1,234");
    expect(screen.getByTestId("load-gen-orders-failed")).toHaveTextContent("5");
    expect(screen.getByTestId("load-gen-stop")).toBeInTheDocument();
    expect(screen.queryByTestId("load-gen-rate-input")).not.toBeInTheDocument();
  });

  it("highlights failures count when non-zero", () => {
    mockStatus = {
      running: true,
      ordersSent: 100,
      ordersFailed: 7,
      startedAt: Date.now() - 1_000,
      stopAt: Date.now() + 60_000,
      config: { ratePerSecond: 50 },
    };
    render(<LoadGenPanel />);
    expect(screen.getByTestId("load-gen-orders-failed").className).toContain("amber");
  });

  it("does not highlight failures when zero", () => {
    mockStatus = {
      running: true,
      ordersSent: 100,
      ordersFailed: 0,
      startedAt: Date.now() - 1_000,
      stopAt: Date.now() + 60_000,
      config: { ratePerSecond: 50 },
    };
    render(<LoadGenPanel />);
    expect(screen.getByTestId("load-gen-orders-failed").className).not.toContain("amber");
  });

  it("renders last-error banner when present", () => {
    mockStatus = {
      running: true,
      ordersSent: 10,
      ordersFailed: 2,
      startedAt: Date.now() - 1_000,
      stopAt: Date.now() + 60_000,
      config: { ratePerSecond: 50 },
      lastError: "gateway returned 502",
    };
    render(<LoadGenPanel />);
    expect(screen.getByText(/gateway returned 502/)).toBeInTheDocument();
  });

  it("calls stop mutation when Stop clicked", async () => {
    mockStatus = {
      running: true,
      ordersSent: 10,
      ordersFailed: 0,
      startedAt: Date.now(),
      stopAt: Date.now() + 60_000,
      config: { ratePerSecond: 50 },
    };
    render(<LoadGenPanel />);
    fireEvent.click(screen.getByTestId("load-gen-stop"));
    await Promise.resolve();
    expect(stopMutation).toHaveBeenCalledTimes(1);
  });

  it("formats short runtimes in seconds, medium in m+s, long in h+m", () => {
    mockStatus = {
      running: true,
      ordersSent: 1,
      ordersFailed: 0,
      startedAt: Date.now() - 45_000,
      stopAt: Date.now() + 1_000,
      config: { ratePerSecond: 1 },
    };
    const { unmount } = render(<LoadGenPanel />);
    expect(screen.getByText(/^45s$/)).toBeInTheDocument();
    unmount();

    mockStatus = {
      running: true,
      ordersSent: 1,
      ordersFailed: 0,
      startedAt: Date.now() - (5 * 60_000 + 12_000),
      stopAt: Date.now() + 1_000,
      config: { ratePerSecond: 1 },
    };
    const { unmount: unmount2 } = render(<LoadGenPanel />);
    expect(screen.getByText(/^5m 12s$/)).toBeInTheDocument();
    unmount2();

    mockStatus = {
      running: true,
      ordersSent: 1,
      ordersFailed: 0,
      startedAt: Date.now() - (2 * 60 * 60_000 + 30 * 60_000),
      stopAt: Date.now() + 1_000,
      config: { ratePerSecond: 1 },
    };
    render(<LoadGenPanel />);
    expect(screen.getByText(/^2h 30m$/)).toBeInTheDocument();
  });
});
