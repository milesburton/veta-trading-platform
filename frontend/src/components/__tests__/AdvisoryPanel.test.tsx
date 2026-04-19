import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { advisorySlice } from "../../store/advisorySlice";
import { AdvisoryPanel } from "../AdvisoryPanel";

const requestAdvisory = vi.fn();

vi.mock("../../store/advisoryApi.ts", () => ({
  useRequestAdvisoryMutation: () => [requestAdvisory, { isLoading: false }],
}));

function renderPanel(bySymbol: Record<string, unknown> = {}) {
  const store = configureStore({
    reducer: { advisory: advisorySlice.reducer },
    preloadedState: {
      advisory: {
        bySymbol,
      },
    },
  });

  render(
    <Provider store={store}>
      <AdvisoryPanel symbol="AAPL" />
    </Provider>,
  );
}

describe("AdvisoryPanel", () => {
  beforeEach(() => {
    requestAdvisory.mockReset();
    requestAdvisory.mockReturnValue({
      unwrap: () => Promise.resolve({ status: "queued" }),
    });
  });

  it("shows request CTA for not-requested state", () => {
    renderPanel();

    expect(screen.getByText(/AI Advisory/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Get Advisory/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Not financial advice/i)).toBeInTheDocument();
  });

  it("shows dedupe message when request is deduplicated", async () => {
    requestAdvisory.mockReturnValue({
      unwrap: () => Promise.resolve({ status: "deduplicated" }),
    });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Get Advisory/i }));

    expect(
      await screen.findByText(/recent advisory job already exists/i),
    ).toBeInTheDocument();
  });

  it("renders ready note and refreshes advisory", async () => {
    renderPanel({
      AAPL: {
        symbol: "AAPL",
        status: "ready",
        jobId: "job-1",
        note: {
          id: "note-1",
          jobId: "job-1",
          symbol: "AAPL",
          content: "Consider reducing position size.",
          provider: "openai",
          modelId: "gpt",
          promptTokens: 10,
          completionTokens: 12,
          latencyMs: 100,
          createdAt: Date.now(),
        },
        errorMessage: null,
        requestedAt: Date.now(),
      },
    });

    expect(
      screen.getByText(/Consider reducing position size/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));

    await waitFor(() => {
      expect(requestAdvisory).toHaveBeenCalledWith({ symbol: "AAPL" });
    });
  });
});
