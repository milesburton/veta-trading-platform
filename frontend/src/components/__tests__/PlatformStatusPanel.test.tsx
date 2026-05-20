import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useGetPlatformStatusQueryMock = vi.fn();
let nextSubmitResponse: { ok: boolean; error?: string } | "error" = { ok: true };
let submitBugSpy: (arg: unknown) => void = () => {};

vi.mock("@veta/frontend/store/servicesApi.ts", async () => {
  const actual: Record<string, unknown> = await vi.importActual(
    "@veta/frontend/store/servicesApi.ts"
  );
  return {
    ...actual,
    useGetPlatformStatusQuery: (...args: unknown[]) => useGetPlatformStatusQueryMock(...args),
    useSubmitBugReportMutation: () => {
      const [state, setState] = useState<{
        isLoading: boolean;
        data?: { ok: boolean; error?: string };
        error?: unknown;
      }>({ isLoading: false });
      const trigger = vi.fn((_arg: unknown) => {
        submitBugSpy(_arg);
        const promise = (async () => {
          if (nextSubmitResponse === "error") {
            setState({ isLoading: false, error: { status: 500 } });
            throw new Error("submission failed");
          }
          setState({ isLoading: false, data: nextSubmitResponse });
          return nextSubmitResponse;
        })();
        return { unwrap: () => promise };
      });
      const reset = vi.fn(() => setState({ isLoading: false }));
      return [trigger, { ...state, reset }];
    },
  };
});

import { PlatformStatusPanel } from "@veta/frontend/components/PlatformStatusPanel";

const baseStatus = {
  version: "abc1234deadbeef",
  environment: "prod",
  startedAt: 0,
  uptimeMs: 60 * 60 * 1000,
  services: { gateway: true, oms: true, ems: true },
  stats: {
    windowStart: 0,
    windowEnd: 0,
    alertsBySeverity: {},
    bugReports: 0,
    uniqueBugReporters: 0,
    serviceUpRatio: 1,
    worstServiceUpRatio: 1,
    lastCritical: null,
    lastDeploySha: "abc1234deadbeef",
  },
};

beforeEach(() => {
  useGetPlatformStatusQueryMock.mockReset();
  nextSubmitResponse = { ok: true };
  submitBugSpy = () => {};
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PlatformStatusPanel", () => {
  it("renders loading state", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ isLoading: true });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/loading platform status/i)).toBeInTheDocument();
  });

  it("renders 403 message when error.status is 403", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      isError: true,
      error: { status: 403 },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByTestId("platform-status-error").textContent).toMatch(/admin or oncall/i);
  });

  it("renders network-error message when error.status is FETCH_ERROR", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      isError: true,
      error: { status: "FETCH_ERROR" },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByTestId("platform-status-error").textContent).toMatch(/reach the gateway/i);
  });

  it("renders ✅ header when worst-window is exactly 1.0", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    const matches = screen.getAllByText(/abc1234/);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText(/prod/)).toBeInTheDocument();
  });

  it("renders ⚠️ header when worst-window is below 1.0", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        stats: { ...baseStatus.stats, worstServiceUpRatio: 0.97, serviceUpRatio: 0.99 },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/97\.0%/)).toBeInTheDocument();
  });

  it("opens the bug-report dialog when Report bug is clicked", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    expect(screen.queryByTestId("bug-report-dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("open-bug-report"));
    expect(screen.getByTestId("bug-report-dialog")).toBeInTheDocument();
  });

  it("dialog declares accessible role and aria-modal", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    const dialog = screen.getByTestId("bug-report-dialog");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("submits a bug report and shows success on ok:true", async () => {
    nextSubmitResponse = { ok: true };
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    fireEvent.change(screen.getByTestId("bug-report-title"), {
      target: { value: "Bad behaviour" },
    });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Repro steps included here so we exceed ten chars." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-result").textContent).toMatch(/posted to the Discord/i);
    });
  });

  it("shows queued-but-not-delivered when backend returns 202 ok:false", async () => {
    nextSubmitResponse = { ok: false, error: "webhook not configured" };
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Bug title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Some description text long enough" },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-queued")).toBeInTheDocument();
    });
  });

  it("closes the dialog on Escape key", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    expect(screen.getByTestId("bug-report-dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("bug-report-dialog")).toBeNull();
  });

  it("surfaces unknown-severity alerts in breakdown", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        stats: {
          ...baseStatus.stats,
          alertsBySeverity: { CRITICAL: 1, UNKNOWN: 2 },
        },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});
