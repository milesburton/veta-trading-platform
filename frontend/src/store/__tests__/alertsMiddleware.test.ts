import type { Alert, AlertSeverity } from "@veta/frontend/store/alertsSlice";
import { alertAdded, alertDismissed, allAlertsDismissed } from "@veta/frontend/store/alertsSlice";
import { allBlocksCleared, blockAdded } from "@veta/frontend/store/killSwitchSlice";
import { orderBookUpdated } from "@veta/frontend/store/marketSlice";
import { alertsMiddleware } from "@veta/frontend/store/middleware/alertsMiddleware";
import { orderPatched } from "@veta/frontend/store/ordersSlice";
import type { OrderBookSnapshot } from "@veta/frontend/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createHarness(
  authUser: { id: string } | null = { id: "u1" },
  initialAlerts: Alert[] = [],
  selectedAsset: string | null = null
) {
  const dispatched: unknown[] = [];
  let alerts: Alert[] = [...initialAlerts];

  const storeAPI = {
    dispatch: (action: unknown) => {
      dispatched.push(action);
      const typed = action as { type: string; payload?: Alert };
      if (alertAdded.match(typed) && typed.payload) {
        alerts = [typed.payload, ...alerts];
      }
      return action;
    },
    getState: () => ({
      auth: { user: authUser },
      alerts: { alerts },
      ui: { selectedAsset },
    }),
  };

  const next = vi.fn((action: unknown) => action);
  const invoke = alertsMiddleware(storeAPI as never)(next);
  return { dispatched, next, invoke };
}

function book(bid: number, ask: number): OrderBookSnapshot {
  return {
    bids: [{ price: bid, size: 100 }],
    asks: [{ price: ask, size: 100 }],
    mid: (bid + ask) / 2,
    ts: 1000,
  };
}

describe("alertsMiddleware", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes all actions through to next", () => {
    const { next, invoke } = createHarness();
    const action = { type: "some/action" };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
  });

  describe("blockAdded from gateway", () => {
    it("dispatches a CRITICAL kill-switch alert for fromGateway block", () => {
      const { dispatched, invoke } = createHarness();
      invoke(
        blockAdded({
          id: "b1",
          scope: "all",
          scopeValues: [],
          issuedBy: "admin",
          issuedAt: 1000,
          fromGateway: true,
        })
      );
      const alert = dispatched.find((a) => alertAdded.match(a as { type: string })) as {
        payload: { severity: string; message: string };
      };
      expect(alert?.payload.severity).toBe("CRITICAL");
      expect(alert?.payload.message).toContain("Kill switch activated");
      expect(alert?.payload.message).toContain("all orders halted");
    });

    it("formats user scope in kill-switch alert message", () => {
      const { dispatched, invoke } = createHarness();
      invoke(
        blockAdded({
          id: "b2",
          scope: "user",
          scopeValues: ["trader1"],
          issuedBy: "admin",
          issuedAt: 1000,
          fromGateway: true,
        })
      );
      const alert = dispatched.find((a) => alertAdded.match(a as { type: string })) as {
        payload: { message: string };
      };
      expect(alert?.payload.message).toContain("user trading halted");
    });

    it("formats symbol scope in kill-switch alert message", () => {
      const { dispatched, invoke } = createHarness();
      invoke(
        blockAdded({
          id: "b3",
          scope: "symbol",
          scopeValues: ["AAPL", "TSLA"],
          issuedBy: "risk",
          issuedAt: 2000,
          fromGateway: true,
        })
      );
      const alert = dispatched.find((a) => alertAdded.match(a as { type: string })) as {
        payload: { message: string };
      };
      expect(alert?.payload.message).toContain("symbol: AAPL, TSLA");
    });

    it("does NOT dispatch alert when fromGateway is false", () => {
      const { dispatched, invoke } = createHarness();
      invoke(
        blockAdded({
          id: "b4",
          scope: "all",
          scopeValues: [],
          issuedBy: "ui",
          issuedAt: 1000,
          fromGateway: false,
        })
      );
      const killAlert = dispatched.find(
        (a) =>
          alertAdded.match(a as { type: string }) &&
          (a as { payload: { source: string } }).payload.source === "kill-switch"
      );
      expect(killAlert).toBeUndefined();
    });
  });

  describe("allBlocksCleared", () => {
    it("dispatches an INFO alert when trading resumes", () => {
      const { dispatched, invoke } = createHarness();
      invoke(allBlocksCleared());
      const alert = dispatched.find((a) => alertAdded.match(a as { type: string })) as {
        payload: { severity: string; message: string };
      };
      expect(alert?.payload.severity).toBe("INFO");
      expect(alert?.payload.message).toContain("Kill switch cleared");
    });
  });

  describe("orderPatched – rejected orders", () => {
    it("dispatches a WARNING alert when an order is rejected", () => {
      const { dispatched, invoke } = createHarness();
      invoke(orderPatched({ id: "ord-99", patch: { status: "rejected" } }));
      const alert = dispatched.find((a) => alertAdded.match(a as { type: string })) as {
        payload: {
          severity: string;
          message: string;
          detail?: string;
          relatedEventId?: string;
          relatedTopic?: string;
        };
      };
      expect(alert?.payload.severity).toBe("WARNING");
      expect(alert?.payload.message).toContain("rejected");
      expect(alert?.payload.detail).toBe("ord-99");
      expect(alert?.payload.relatedEventId).toBe("ord-99");
      expect(alert?.payload.relatedTopic).toBe("orders.rejected");
    });

    it("does NOT alert for non-rejected patches", () => {
      const { dispatched, invoke } = createHarness();
      invoke(orderPatched({ id: "ord-1", patch: { status: "working" } }));
      const alert = dispatched.find((a) => alertAdded.match(a as { type: string }));
      expect(alert).toBeUndefined();
    });
  });

  describe("orderBookUpdated – wide spread alert", () => {
    it("dispatches a WARNING alert when the selected asset's spread exceeds threshold", () => {
      const { dispatched, invoke } = createHarness({ id: "u1" }, [], "AAPL");
      // mid=100, spread=1 -> 100 bps, well above the 50bps warning threshold
      invoke(orderBookUpdated({ AAPL: book(99.5, 100.5) }));
      const alert = dispatched.find((a) => alertAdded.match(a as { type: string })) as {
        payload: { severity: string; source: string; message: string };
      };
      expect(alert?.payload.severity).toBe("WARNING");
      expect(alert?.payload.source).toBe("market-data");
      expect(alert?.payload.message).toContain("AAPL");
      expect(alert?.payload.message).toContain("bps");
    });

    it("does NOT alert when spread is within threshold", () => {
      const { dispatched, invoke } = createHarness({ id: "u1" }, [], "AAPL");
      // mid=100, spread=0.01 -> 1 bps, well under threshold
      invoke(orderBookUpdated({ AAPL: book(99.995, 100.005) }));
      const alert = dispatched.find(
        (a) =>
          alertAdded.match(a as { type: string }) &&
          (a as { payload: { source: string } }).payload.source === "market-data"
      );
      expect(alert).toBeUndefined();
    });

    it("treats a bid of exactly 0 as a real (extreme) spread, not missing data", () => {
      const { dispatched, invoke } = createHarness({ id: "u1" }, [], "AAPL");
      invoke(orderBookUpdated({ AAPL: book(0, 100) }));
      const alert = dispatched.find((a) => alertAdded.match(a as { type: string })) as {
        payload: { source: string; message: string };
      };
      expect(alert?.payload.source).toBe("market-data");
      expect(alert?.payload.message).toContain("20000 bps");
    });

    it("does NOT alert when there is no book for the selected symbol (undefined bid/ask)", () => {
      const { dispatched, invoke } = createHarness({ id: "u1" }, [], "AAPL");
      invoke(orderBookUpdated({ AAPL: { bids: [], asks: [], mid: 100, ts: 1000 } }));
      const alert = dispatched.find(
        (a) =>
          alertAdded.match(a as { type: string }) &&
          (a as { payload: { source: string } }).payload.source === "market-data"
      );
      expect(alert).toBeUndefined();
    });

    it("does NOT alert for a symbol that is not currently selected", () => {
      const { dispatched, invoke } = createHarness({ id: "u1" }, [], "AAPL");
      invoke(orderBookUpdated({ TSLA: book(99.5, 100.5) }));
      const alert = dispatched.find(
        (a) =>
          alertAdded.match(a as { type: string }) &&
          (a as { payload: { source: string } }).payload.source === "market-data"
      );
      expect(alert).toBeUndefined();
    });

    it("only alerts once per excursion above threshold (edge-triggered)", () => {
      const { dispatched, invoke } = createHarness({ id: "u1" }, [], "AAPL");
      invoke(orderBookUpdated({ AAPL: book(99.5, 100.5) }));
      invoke(orderBookUpdated({ AAPL: book(99.4, 100.6) }));
      const marketDataAlerts = dispatched.filter(
        (a) =>
          alertAdded.match(a as { type: string }) &&
          (a as { payload: { source: string } }).payload.source === "market-data"
      );
      expect(marketDataAlerts.length).toBe(1);
    });

    it("re-alerts after the spread returns to normal and widens again", () => {
      const { dispatched, invoke } = createHarness({ id: "u1" }, [], "AAPL");
      invoke(orderBookUpdated({ AAPL: book(99.5, 100.5) }));
      invoke(orderBookUpdated({ AAPL: book(99.99, 100.01) }));
      invoke(orderBookUpdated({ AAPL: book(99.5, 100.5) }));
      const marketDataAlerts = dispatched.filter(
        (a) =>
          alertAdded.match(a as { type: string }) &&
          (a as { payload: { source: string } }).payload.source === "market-data"
      );
      expect(marketDataAlerts.length).toBe(2);
    });
  });

  describe("alertAdded – persisting to backend", () => {
    it("calls fetch to POST the alert when user is logged in and source is not service", () => {
      const alertPayload = {
        severity: "INFO" as AlertSeverity,
        source: "order" as const,
        message: "Test alert",
        ts: 1000,
      };
      // Seed the state with the alert so postAlert can read alerts[0]
      const { invoke } = createHarness({ id: "u1" }, [
        { ...alertPayload, id: "seed-1", dismissed: false },
      ]);
      invoke(alertAdded(alertPayload));
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("/alerts"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("does NOT post alert when source is service", () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockClear();
      const { invoke } = createHarness({ id: "u1" });
      invoke(
        alertAdded({
          severity: "INFO",
          source: "service",
          message: "Service alert",
          ts: 1000,
        })
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does NOT post alert when user is not logged in", () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockClear();
      const { invoke } = createHarness(null);
      invoke(
        alertAdded({
          severity: "WARNING",
          source: "order",
          message: "Anon alert",
          ts: 1000,
        })
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("alertDismissed", () => {
    it("calls fetch PUT to dismiss a single alert", () => {
      const { invoke } = createHarness();
      invoke(alertDismissed("alert-42"));
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("/alert-42/dismiss"),
        expect.objectContaining({ method: "PUT" })
      );
    });
  });

  describe("allAlertsDismissed", () => {
    it("calls fetch PUT to dismiss all alerts", () => {
      const { invoke } = createHarness();
      invoke(allAlertsDismissed());
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("/dismiss-all"),
        expect.objectContaining({ method: "PUT" })
      );
    });
  });
});
