import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { StartupOverlay } from "../StartupOverlay";

const READY_RESPONSE = {
  ready: true,
  services: { marketSim: true, journal: true, userService: true, bus: true },
};

const NOT_READY_RESPONSE = {
  ready: false,
  services: { marketSim: true, journal: false, userService: false, bus: false },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StartupOverlay", () => {
  test("renders brand, status text, and all service indicators", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(NOT_READY_RESPONSE), { status: 200 })
    );
    render(<StartupOverlay onReady={vi.fn()} />);

    expect(screen.getByTestId("brand-title")).toHaveTextContent("VETA");
    expect(screen.getByTestId("startup-status")).toHaveTextContent(
      /starting up|waiting for services/i
    );
    expect(screen.getByTestId("service-indicator-gateway")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-bus")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-marketSim")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-userService")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-journal")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-ems")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-oms")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-analytics")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-marketData")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-featureEngine")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-signalEngine")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-recommendationEngine")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-scenarioEngine")).toBeInTheDocument();
    expect(screen.getByTestId("service-indicator-llmAdvisory")).toBeInTheDocument();
  });

  test("shows elapsed time counter ticking up", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(NOT_READY_RESPONSE), { status: 200 })
    );
    render(<StartupOverlay onReady={vi.fn()} />);

    expect(screen.getByTestId("startup-elapsed")).toHaveTextContent("0s elapsed");

    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });

    expect(screen.getByTestId("startup-elapsed")).toHaveTextContent("3s elapsed");
    vi.useRealTimers();
  });

  test("formats elapsed time as minutes when >= 60s", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(NOT_READY_RESPONSE), { status: 200 })
    );
    render(<StartupOverlay onReady={vi.fn()} />);

    await act(async () => {
      vi.advanceTimersByTime(75_000);
    });

    expect(screen.getByTestId("startup-elapsed")).toHaveTextContent("1m 15s elapsed");
    vi.useRealTimers();
  });

  test("calls onReady when ready response received", async () => {
    const onReady = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(READY_RESPONSE), { status: 200 })
    );
    render(<StartupOverlay onReady={onReady} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  });

  test("continues polling when not ready and calls onReady once ready", async () => {
    const onReady = vi.fn();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(NOT_READY_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(READY_RESPONSE), { status: 200 }));

    render(<StartupOverlay onReady={onReady} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1), { timeout: 10_000 });
  });

  test("handles fetch failure gracefully and keeps polling", async () => {
    const onReady = vi.fn();
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(new Response(JSON.stringify(READY_RESPONSE), { status: 200 }));

    render(<StartupOverlay onReady={onReady} />);

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1), { timeout: 10_000 });
  });

  test("updates service indicator colours based on service state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(NOT_READY_RESPONSE), { status: 200 })
    );
    render(<StartupOverlay onReady={vi.fn()} />);

    await waitFor(() => {
      const marketSimDot = screen.getByTestId("service-indicator-marketSim").querySelector("span");
      expect(marketSimDot?.className).toContain("bg-emerald-400");
    });

    const journalDot = screen.getByTestId("service-indicator-journal").querySelector("span");
    expect(journalDot?.className).toContain("bg-gray-600");
  });

  test("renders build info footer when props provided", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(NOT_READY_RESPONSE), { status: 200 })
    );
    render(<StartupOverlay onReady={vi.fn()} buildDate="2026-03-08" commitSha="abc1234" />);

    const footer = screen.getByTestId("startup-build-info");
    expect(footer).toHaveTextContent("2026-03-08");
    expect(footer).toHaveTextContent("abc1234");
  });

  test("renders empty build info footer when props omitted", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(NOT_READY_RESPONSE), { status: 200 })
    );
    render(<StartupOverlay onReady={vi.fn()} />);

    expect(screen.getByTestId("startup-build-info")).toBeEmptyDOMElement();
  });
});
