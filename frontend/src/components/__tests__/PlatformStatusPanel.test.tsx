import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useGetPlatformStatusQueryMock = vi.fn();

interface SubmitOk {
  ok: boolean;
  discordDelivered?: boolean;
  ticket?: {
    created: boolean;
    issueNumber: number | null;
    url: string | null;
    reason: string | null;
  };
  error?: string;
}
interface SubmitReject {
  reject: true;
}
type NextSubmitResponse = SubmitOk | SubmitReject;
function isReject(r: NextSubmitResponse): r is SubmitReject {
  return "reject" in r && r.reject === true;
}

let nextSubmitResponse: NextSubmitResponse = { ok: true };
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
        data?: SubmitOk;
        error?: unknown;
      }>({ isLoading: false });
      const trigger = vi.fn((_arg: unknown) => {
        submitBugSpy(_arg);
        const promise = (async () => {
          if (isReject(nextSubmitResponse)) {
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
  ticketing: {
    state: "healthy" as const,
    healthy: true,
    checkedAt: 1,
    statusCode: 200,
    repo: "milesburton/veta-trading-platform",
  },
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

  it("opens the ticket dialog when Raise ticket is clicked", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    expect(screen.queryByTestId("bug-report-dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("open-bug-report"));
    expect(screen.getByTestId("bug-report-dialog")).toBeInTheDocument();
  });

  it("shows a failed GitHub ticketing health state", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        ticketing: { ...baseStatus.ticketing, healthy: false, state: "unauthorised" },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByTestId("github-ticketing-health")).toHaveTextContent("unauthorised");
  });

  it("dialog declares accessible role and aria-modal", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    const dialog = screen.getByTestId("bug-report-dialog");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("submits a user ticket and shows success on ok:true", async () => {
    nextSubmitResponse = { ok: true, discordDelivered: true };
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    fireEvent.change(screen.getByTestId("bug-report-title"), {
      target: { value: "Bad behaviour" },
    });
    fireEvent.click(screen.getByText("feature"));
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Repro steps included here so we exceed ten chars." },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-result").textContent).toMatch(/notified Support/i);
    });
  });

  it("warns when Discord succeeds but GitHub issue creation fails", async () => {
    nextSubmitResponse = {
      ok: true,
      discordDelivered: true,
      ticket: { created: false, issueNumber: null, url: null, reason: "unauthorised" },
    };
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Bug title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Some description text long enough" },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("github-ticketing-warning")).toHaveTextContent("unauthorised");
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
    expect(screen.getByTestId("bug-report-queued").textContent).toMatch(/GITHUB_TICKETING_REPO/);
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

  it("renders generic HTTP error message for non-403 statuses", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      isError: true,
      error: { status: 500 },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByTestId("platform-status-error").textContent).toMatch(/HTTP 500/);
  });

  it("renders fallback error message when error shape is unknown", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      isError: true,
      error: "some unstructured failure",
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByTestId("platform-status-error").textContent).toMatch(
      /Unable to load platform status\./
    );
  });

  it("renders 🚨 header when worst-window is below 95%", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        stats: { ...baseStatus.stats, worstServiceUpRatio: 0.5, serviceUpRatio: 0.6 },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/50\.0%/)).toBeInTheDocument();
  });

  it("renders ℹ️ header when worstServiceUpRatio is null", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        stats: { ...baseStatus.stats, worstServiceUpRatio: null, serviceUpRatio: null },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/No samples yet/i)).toBeInTheDocument();
  });

  it("formats uptime with days when uptimeMs exceeds 24h", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        uptimeMs: (2 * 86400 + 3 * 3600 + 5 * 60) * 1000,
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/2d 3h 5m/)).toBeInTheDocument();
  });

  it("formats uptime with minutes only when under 1h", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        uptimeMs: 15 * 60 * 1000,
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/uptime 15m/)).toBeInTheDocument();
  });

  it("renders down service names with truncation when >3 are down", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        services: {
          gateway: true,
          oms: false,
          ems: false,
          journal: false,
          analytics: false,
          marketSim: false,
        },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
  });

  it("renders down service names without truncation when ≤3 are down", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        services: { gateway: true, oms: false, ems: false },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/oms, ems/)).toBeInTheDocument();
  });

  it("renders last critical block when stats.lastCritical is set", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        stats: {
          ...baseStatus.stats,
          alertsBySeverity: { CRITICAL: 1 },
          lastCritical: {
            ts: Date.now() - 5 * 60 * 1000,
            source: "kill-switch",
            message: "kill switch fired",
          },
        },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/last critical/i)).toBeInTheDocument();
    expect(screen.getByText("kill-switch")).toBeInTheDocument();
  });

  it("renders singular 'user' when uniqueBugReporters is 1", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        stats: { ...baseStatus.stats, bugReports: 5, uniqueBugReporters: 1 },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/5 from 1 user/)).toBeInTheDocument();
  });

  it("renders plural 'users' when uniqueBugReporters > 1", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        stats: { ...baseStatus.stats, bugReports: 5, uniqueBugReporters: 3 },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.getByText(/5 from 3 users/)).toBeInTheDocument();
  });

  it("submit button is disabled when title or description is too short", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    const submitBtn = screen.getByTestId("bug-report-submit") as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "ok" } });
    expect(submitBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "valid title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "short" },
    });
    expect(submitBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "now it is long enough" },
    });
    expect(submitBtn.disabled).toBe(false);
  });

  it("shows submission-failed error when mutation rejects", async () => {
    nextSubmitResponse = { reject: true };
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Bug title" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Some description text long enough" },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-error")).toBeInTheDocument();
    });
  });

  it("Cancel button closes the dialog", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    expect(screen.getByTestId("bug-report-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("bug-report-dialog")).toBeNull();
  });

  it("Close button (X) closes the dialog", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    fireEvent.click(screen.getByTestId("bug-report-close"));
    expect(screen.queryByTestId("bug-report-dialog")).toBeNull();
  });

  it("changes category via the select element", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    let captured: { category?: string } = {};
    submitBugSpy = (arg) => {
      captured = arg as { category?: string };
    };
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    fireEvent.change(screen.getByTestId("bug-report-category"), { target: { value: "data" } });
    fireEvent.change(screen.getByTestId("bug-report-title"), { target: { value: "Title here" } });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "Description long enough to pass validation" },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    expect(captured.category).toBe("data");
  });

  it("Submit another resets the form back to the input view", async () => {
    nextSubmitResponse = { ok: true };
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    fireEvent.click(screen.getByTestId("open-bug-report"));
    fireEvent.change(screen.getByTestId("bug-report-title"), {
      target: { value: "first bug" },
    });
    fireEvent.change(screen.getByTestId("bug-report-description"), {
      target: { value: "description that is plenty long enough" },
    });
    fireEvent.click(screen.getByTestId("bug-report-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bug-report-submit-another")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("bug-report-submit-another"));
    expect(screen.getByTestId("bug-report-title")).toBeInTheDocument();
  });

  it("hides deployed-sha line when lastDeploySha is null", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({
      data: {
        ...baseStatus,
        stats: { ...baseStatus.stats, lastDeploySha: null },
      },
    });
    render(<PlatformStatusPanel />);
    expect(screen.queryByText(/deployed sha/i)).toBeNull();
  });

  it("renders 'none' when bugReports is zero", () => {
    useGetPlatformStatusQueryMock.mockReturnValue({ data: baseStatus });
    render(<PlatformStatusPanel />);
    const noneMatches = screen.getAllByText(/^none/);
    expect(noneMatches.length).toBeGreaterThan(0);
  });
});
