import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoDayPanel } from "../DemoDayPanel";

const runDemoDay = vi.fn();

vi.mock("../../store/gatewayApi.ts", () => ({
  useRunDemoDayMutation: () => [runDemoDay, { isLoading: false }],
}));

vi.mock("../../store/hooks.ts", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => {
    const state = {
      auth: {
        user: { id: "u-1", name: "Taylor", role: "admin", avatar_emoji: "📈" },
      },
    };
    return selector(state);
  },
}));

describe("DemoDayPanel", () => {
  beforeEach(() => {
    runDemoDay.mockReset();
  });

  it("renders default scenario and launch button", () => {
    render(<DemoDayPanel />);

    expect(screen.getByText(/Demo Day/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Launch Demo — Standard Trading Day/i })).toBeInTheDocument();
  });

  it("changes selected scenario and submits it", async () => {
    runDemoDay.mockResolvedValue({
      data: { scenario: "market-open", submitted: 120, elapsedMs: 1000, jobId: "job-42" },
    });

    render(<DemoDayPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Market Open/i }));
    fireEvent.click(screen.getByRole("button", { name: /Launch Demo — Market Open/i }));

    await waitFor(() => {
      expect(runDemoDay).toHaveBeenCalledWith({ scenario: "market-open" });
    });

    expect(await screen.findByText(/Demo launched/i)).toBeInTheDocument();
    expect(screen.getByText(/market-open/i)).toBeInTheDocument();
    expect(screen.getByText(/job-42/i)).toBeInTheDocument();
  });

  it("maps 503 response to message bus error", async () => {
    runDemoDay.mockResolvedValue({ error: { status: 503 } });

    render(<DemoDayPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Launch Demo/i }));

    expect(await screen.findByText(/Message bus unavailable/i)).toBeInTheDocument();
  });
});
