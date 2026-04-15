import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import {
  alertAdded,
  alertsSlice,
  allMuteRulesCleared,
  muteRuleAdded,
  muteRuleRemoved,
  selectActiveAlerts,
  selectAlertCount,
  selectCriticalAlerts,
  selectHighestSeverity,
  selectMuteRules,
} from "../alertsSlice";
import type { RootState } from "../index";

const { reducer } = alertsSlice;

function makeStore(preloadedAlerts?: Parameters<typeof alertAdded>[0][]) {
  const store = configureStore({
    reducer: { alerts: reducer },
  });
  for (const a of preloadedAlerts ?? []) {
    store.dispatch(alertAdded(a));
  }
  return store;
}

function state(store: ReturnType<typeof makeStore>): RootState {
  return store.getState() as unknown as RootState;
}

const CRITICAL_ALERT = {
  severity: "CRITICAL" as const,
  source: "kill-switch" as const,
  message: "Kill switch activated",
  ts: Date.now(),
};

const WARNING_ALERT = {
  severity: "WARNING" as const,
  source: "order" as const,
  message: "Order rejected: AAPL",
  ts: Date.now(),
};

const INFO_ALERT = {
  severity: "INFO" as const,
  source: "service" as const,
  message: "OMS recovered",
  ts: Date.now(),
};

describe("muteRules — reducer", () => {
  it("adds a mute rule with generated id and createdAt", () => {
    const state = reducer(undefined, muteRuleAdded({ source: "service" }));
    expect(state.muteRules).toHaveLength(1);
    expect(state.muteRules[0].id).toBeTruthy();
    expect(state.muteRules[0].source).toBe("service");
    expect(state.muteRules[0].createdAt).toBeGreaterThan(0);
  });

  it("removes a mute rule by id", () => {
    let state = reducer(undefined, muteRuleAdded({ source: "service" }));
    const ruleId = state.muteRules[0].id;
    state = reducer(state, muteRuleRemoved(ruleId));
    expect(state.muteRules).toHaveLength(0);
  });

  it("clears all mute rules", () => {
    let state = reducer(undefined, muteRuleAdded({ source: "service" }));
    state = reducer(state, muteRuleAdded({ severity: "WARNING" }));
    expect(state.muteRules).toHaveLength(2);
    state = reducer(state, allMuteRulesCleared());
    expect(state.muteRules).toHaveLength(0);
  });

  it("supports compound rules (source + severity)", () => {
    const state = reducer(undefined, muteRuleAdded({ source: "order", severity: "WARNING" }));
    expect(state.muteRules[0].source).toBe("order");
    expect(state.muteRules[0].severity).toBe("WARNING");
  });

  it("supports message substring matching", () => {
    const state = reducer(undefined, muteRuleAdded({ messageContains: "heartbeat" }));
    expect(state.muteRules[0].messageContains).toBe("heartbeat");
  });
});

describe("muteRules — selectors", () => {
  it("selectActiveAlerts excludes alerts matching a source mute rule", () => {
    const store = makeStore([CRITICAL_ALERT, WARNING_ALERT, INFO_ALERT]);
    store.dispatch(muteRuleAdded({ source: "service" }));
    const active = selectActiveAlerts(state(store));
    expect(active.every((a) => a.source !== "service")).toBe(true);
    expect(active).toHaveLength(2);
  });

  it("selectActiveAlerts excludes alerts matching a severity mute rule", () => {
    const store = makeStore([CRITICAL_ALERT, WARNING_ALERT, INFO_ALERT]);
    store.dispatch(muteRuleAdded({ severity: "WARNING" }));
    const active = selectActiveAlerts(state(store));
    expect(active.every((a) => a.severity !== "WARNING")).toBe(true);
  });

  it("selectActiveAlerts excludes alerts matching a compound rule", () => {
    const store = makeStore([CRITICAL_ALERT, WARNING_ALERT, INFO_ALERT]);
    store.dispatch(muteRuleAdded({ source: "order", severity: "WARNING" }));
    const active = selectActiveAlerts(state(store));
    expect(active).toHaveLength(2);
    expect(active.find((a) => a.source === "order")).toBeUndefined();
  });

  it("compound rule does not mute alerts that only partially match", () => {
    const store = makeStore([
      WARNING_ALERT,
      { severity: "WARNING", source: "algo" as const, message: "Algo warning", ts: Date.now() },
    ]);
    store.dispatch(muteRuleAdded({ source: "order", severity: "WARNING" }));
    const active = selectActiveAlerts(state(store));
    expect(active).toHaveLength(1);
    expect(active[0].source).toBe("algo");
  });

  it("selectActiveAlerts excludes alerts matching messageContains (case-insensitive)", () => {
    const store = makeStore([
      {
        severity: "WARNING",
        source: "algo" as const,
        message: "TWAP Heartbeat lost",
        ts: Date.now(),
      },
      { severity: "WARNING", source: "algo" as const, message: "VWAP complete", ts: Date.now() },
    ]);
    store.dispatch(muteRuleAdded({ messageContains: "heartbeat" }));
    const active = selectActiveAlerts(state(store));
    expect(active).toHaveLength(1);
    expect(active[0].message).toBe("VWAP complete");
  });

  it("selectCriticalAlerts respects mute rules", () => {
    const store = makeStore([CRITICAL_ALERT, WARNING_ALERT]);
    store.dispatch(muteRuleAdded({ severity: "CRITICAL" }));
    expect(selectCriticalAlerts(state(store))).toHaveLength(0);
  });

  it("selectAlertCount respects mute rules", () => {
    const store = makeStore([CRITICAL_ALERT, WARNING_ALERT, INFO_ALERT]);
    store.dispatch(muteRuleAdded({ source: "kill-switch" }));
    expect(selectAlertCount(state(store))).toBe(1);
  });

  it("selectHighestSeverity respects mute rules", () => {
    const store = makeStore([CRITICAL_ALERT, WARNING_ALERT]);
    store.dispatch(muteRuleAdded({ severity: "CRITICAL" }));
    expect(selectHighestSeverity(state(store))).toBe("WARNING");
  });

  it("selectMuteRules returns the current rules", () => {
    const store = makeStore();
    store.dispatch(muteRuleAdded({ source: "service" }));
    store.dispatch(muteRuleAdded({ severity: "INFO" }));
    expect(selectMuteRules(state(store))).toHaveLength(2);
  });

  it("removing a mute rule re-exposes previously muted alerts", () => {
    const store = makeStore([INFO_ALERT]);
    store.dispatch(muteRuleAdded({ source: "service" }));
    expect(selectActiveAlerts(state(store))).toHaveLength(0);
    const ruleId = selectMuteRules(state(store))[0].id;
    store.dispatch(muteRuleRemoved(ruleId));
    expect(selectActiveAlerts(state(store))).toHaveLength(1);
  });
});
