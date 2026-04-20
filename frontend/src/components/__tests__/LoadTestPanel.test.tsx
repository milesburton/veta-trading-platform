import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import { LoadTestPanel } from "../LoadTestPanel";

const runLoadTest = vi.fn();

vi.mock("../../store/gatewayApi.ts", () => ({
  useRunLoadTestMutation: () => [runLoadTest, { isLoading: false }],
}));

function submitPanelForm() {
  const button = screen.getByRole("button", { name: /Run Load Test/i });
  const form = button.closest("form");

  if (!form) {
    throw new Error("Expected load test form to exist");
  }

  fireEvent.submit(form);
}

function renderPanel(role: "admin" | "viewer" = "admin") {
  const store = configureStore({
    reducer: { auth: authSlice.reducer },
    preloadedState: {
      auth: {
        user: {
          id: "user-1",
          name: "Taylor",
          role,
          avatar_emoji: "📈",
        },
        limits: {
          max_order_qty: 10000,
          max_daily_notional: 1000000,
          allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
          allowed_desks: ["equity"],
          dark_pool_access: false,
        },
        status: "authenticated" as const,
      },
    },
  });

  render(
    <Provider store={store}>
      <LoadTestPanel />
    </Provider>
  );
}

describe("LoadTestPanel", () => {
  beforeEach(() => {
    runLoadTest.mockReset();
  });

  it("blocks non-admin users", () => {
    renderPanel("viewer");

    expect(screen.getByText(/Admin access required/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run Load Test/i })).not.toBeInTheDocument();
  });

  it("submits normalized form values and renders the job summary", async () => {
    runLoadTest.mockResolvedValue({
      data: {
        jobId: "job-7",
        submitted: 120,
        strategy: "VWAP",
        symbols: ["AAPL", "MSFT", "NVDA"],
        elapsedMs: 850,
      },
    });

    renderPanel();

    fireEvent.change(screen.getByLabelText(/Order Count/i), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByLabelText(/Strategy/i), {
      target: { value: "VWAP" },
    });
    fireEvent.change(screen.getByLabelText(/Symbols/i), {
      target: { value: " AAPL, MSFT , NVDA " },
    });
    submitPanelForm();

    await waitFor(() => {
      expect(runLoadTest).toHaveBeenCalledWith({
        orderCount: 120,
        strategy: "VWAP",
        symbols: ["AAPL", "MSFT", "NVDA"],
      });
    });

    expect(await screen.findByText(/Job submitted/i)).toBeInTheDocument();
    expect(screen.getByText(/job-7/i)).toBeInTheDocument();
    expect(screen.getByText(/Orders submitted:/i)).toBeInTheDocument();
  });

  it("surfaces backend errors from the load test request", async () => {
    runLoadTest.mockResolvedValue({
      error: {
        status: 503,
        data: { error: "gateway offline" },
      },
    });

    renderPanel();
    submitPanelForm();

    expect(await screen.findByText(/gateway offline/i)).toBeInTheDocument();
  });
});
