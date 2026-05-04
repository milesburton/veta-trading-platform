import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Alert } from "../../store/alertsSlice";
import { AlertToast } from "../AlertToast";

const dispatch = vi.fn();
const drawerOpenRef = { value: false };
const openDrawer = vi.fn();

let mockQueue: Alert[] = [];

vi.mock("../../store/hooks.ts", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => {
    if (selector.toString().includes("toast") || selector.toString().includes("Toast")) {
      return mockQueue;
    }
    return selector({ alerts: { alerts: mockQueue, muteRules: [] } });
  },
}));

vi.mock("../drawers/DrawersContext.tsx", () => ({
  useDrawers: () => ({
    open: openDrawer,
    close: vi.fn(),
    isOpen: () => drawerOpenRef.value,
  }),
}));

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alert-1",
    severity: "WARNING",
    source: "algo",
    message: "Algo TWAP heartbeat gap detected",
    detail: "Last seen 11s ago",
    ts: Date.now() - 5_000,
    dismissed: false,
    ...overrides,
  };
}

describe("AlertToast", () => {
  beforeEach(() => {
    dispatch.mockReset();
    openDrawer.mockReset();
    drawerOpenRef.value = false;
    mockQueue = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when the queue is empty", () => {
    mockQueue = [];
    const { container } = render(<AlertToast />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing while the Alert Centre drawer is open", () => {
    mockQueue = [makeAlert()];
    drawerOpenRef.value = true;
    const { container } = render(<AlertToast />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the latest alert with severity badge and source", () => {
    mockQueue = [makeAlert({ severity: "CRITICAL", source: "kill-switch" })];
    render(<AlertToast />);
    expect(screen.getByTestId("alert-toast")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText(/Kill switch/)).toBeInTheDocument();
  });

  it("shows ×N count badge when count > 1", () => {
    mockQueue = [makeAlert({ count: 7 })];
    render(<AlertToast />);
    expect(screen.getByText("×7")).toBeInTheDocument();
  });

  it("caps the count badge at 99+", () => {
    mockQueue = [makeAlert({ count: 250 })];
    render(<AlertToast />);
    expect(screen.getByText("×99+")).toBeInTheDocument();
  });

  it("renders 'caused by' line when relatedTopic is set", () => {
    mockQueue = [
      makeAlert({
        relatedTopic: "orders.rejected",
        relatedEventId: "ord-99",
      }),
    ];
    render(<AlertToast />);
    expect(screen.getByText(/caused by/)).toBeInTheDocument();
    expect(screen.getByText(/orders\.rejected/)).toBeInTheDocument();
    expect(screen.getByText(/ord-99/)).toBeInTheDocument();
  });

  it("Got it dispatches alertAcknowledged", () => {
    mockQueue = [makeAlert({ id: "x-1" })];
    render(<AlertToast />);
    fireEvent.click(screen.getByTestId("alert-toast-ack"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "alerts/alertAcknowledged", payload: "x-1" })
    );
  });

  it("× dispatches alertDismissed", () => {
    mockQueue = [makeAlert({ id: "x-2" })];
    render(<AlertToast />);
    fireEvent.click(screen.getByTestId("alert-toast-dismiss"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "alerts/alertDismissed", payload: "x-2" })
    );
  });

  it("View all opens the Alert Centre drawer", () => {
    mockQueue = [makeAlert()];
    render(<AlertToast />);
    fireEvent.click(screen.getByTestId("alert-toast-view-all"));
    expect(openDrawer).toHaveBeenCalled();
  });

  it("position indicator shows 1/N for the latest alert in a multi-alert queue", () => {
    mockQueue = [makeAlert({ id: "newest" }), makeAlert({ id: "older" })];
    render(<AlertToast />);
    expect(screen.getByTestId("alert-toast-position").textContent).toBe("1/2");
  });

  it("prev button is disabled when there's only one alert", () => {
    mockQueue = [makeAlert()];
    render(<AlertToast />);
    expect(screen.getByTestId("alert-toast-prev")).toBeDisabled();
    expect(screen.getByTestId("alert-toast-next")).toBeDisabled();
  });

  it("auto-acknowledges WARNING after 8s", () => {
    mockQueue = [makeAlert({ id: "auto-w", severity: "WARNING" })];
    render(<AlertToast />);
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(8_000);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "alerts/alertAcknowledged", payload: "auto-w" })
    );
  });

  it("does NOT auto-acknowledge CRITICAL", () => {
    mockQueue = [makeAlert({ id: "crit", severity: "CRITICAL" })];
    render(<AlertToast />);
    vi.advanceTimersByTime(60_000);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("renders without detail when only message is set", () => {
    mockQueue = [makeAlert({ detail: undefined })];
    render(<AlertToast />);
    expect(screen.getByTestId("alert-toast")).toBeInTheDocument();
  });

  it("renders without 'caused by' when no related context is set", () => {
    mockQueue = [
      makeAlert({
        relatedTopic: undefined,
        relatedEventId: undefined,
        relatedAt: undefined,
      }),
    ];
    render(<AlertToast />);
    expect(screen.queryByText(/caused by/)).not.toBeInTheDocument();
  });

  it("shows last/first timestamps when count > 1", () => {
    mockQueue = [
      makeAlert({
        count: 5,
        ts: Date.now() - 60_000,
        lastTs: Date.now() - 2_000,
      }),
    ];
    render(<AlertToast />);
    expect(screen.getByText(/first/)).toBeInTheDocument();
    expect(screen.getByText(/last/)).toBeInTheDocument();
  });

  it("falls back to source key when label is unknown", () => {
    mockQueue = [makeAlert({ source: "unknown-source" as unknown as Alert["source"] })];
    render(<AlertToast />);
    expect(screen.getByText("unknown-source")).toBeInTheDocument();
  });
});
