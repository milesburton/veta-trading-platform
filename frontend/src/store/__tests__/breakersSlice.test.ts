import { describe, expect, it } from "vitest";
import {
  breakerExpired,
  breakerFired,
  breakersReconciled,
  breakersSlice,
  cooldownUpdated,
} from "../breakersSlice";

const { reducer } = breakersSlice;

describe("breakersSlice", () => {
  it("adds an entry on breakerFired with expiresAt = ts + cooldownMs", () => {
    const state = reducer(
      undefined,
      breakerFired({
        type: "market-move",
        scope: "symbol",
        scopeValue: "AAPL",
        observedValue: 12.5,
        threshold: 10,
        ts: 1_000_000,
      })
    );
    expect(state.active).toHaveLength(1);
    expect(state.active[0].key).toBe("market-move:AAPL");
    expect(state.active[0].target).toBe("AAPL");
    expect(state.active[0].expiresAt).toBe(1_000_000 + 60_000);
  });

  it("deduplicates the same key within cooldown", () => {
    const s1 = reducer(
      undefined,
      breakerFired({
        type: "market-move",
        scope: "symbol",
        scopeValue: "AAPL",
        observedValue: 12,
        threshold: 10,
        ts: 1_000_000,
      })
    );
    const s2 = reducer(
      s1,
      breakerFired({
        type: "market-move",
        scope: "symbol",
        scopeValue: "AAPL",
        observedValue: 13,
        threshold: 10,
        ts: 1_000_100,
      })
    );
    expect(s2.active).toHaveLength(1);
    expect(s2.active[0].observedValue).toBe(12);
  });

  it("replaces an entry once it has expired", () => {
    const s1 = reducer(
      undefined,
      breakerFired({
        type: "market-move",
        scope: "symbol",
        scopeValue: "AAPL",
        observedValue: 12,
        threshold: 10,
        ts: 1_000_000,
      })
    );
    const s2 = reducer(
      s1,
      breakerFired({
        type: "market-move",
        scope: "symbol",
        scopeValue: "AAPL",
        observedValue: 20,
        threshold: 10,
        ts: 1_000_000 + 60_001,
      })
    );
    expect(s2.active).toHaveLength(1);
    expect(s2.active[0].observedValue).toBe(20);
  });

  it("handles user-scope breakers via targetUserId", () => {
    const s = reducer(
      undefined,
      breakerFired({
        type: "user-pnl",
        scope: "user",
        targetUserId: "user-42",
        observedValue: -60_000,
        threshold: -50_000,
        ts: 500,
      })
    );
    expect(s.active[0].key).toBe("user-pnl:user-42");
    expect(s.active[0].target).toBe("user-42");
  });

  it("ignores fires with no resolvable target", () => {
    const s = reducer(
      undefined,
      breakerFired({
        type: "market-move",
        scope: "symbol",
        observedValue: 11,
        threshold: 10,
        ts: 1,
      })
    );
    expect(s.active).toHaveLength(0);
  });

  it("breakerExpired removes the entry", () => {
    const s1 = reducer(
      undefined,
      breakerFired({
        type: "market-move",
        scope: "symbol",
        scopeValue: "MSFT",
        observedValue: 12,
        threshold: 10,
        ts: 1,
      })
    );
    const s2 = reducer(s1, breakerExpired({ key: "market-move:MSFT" }));
    expect(s2.active).toHaveLength(0);
  });

  it("cooldownUpdated changes subsequent expiries", () => {
    const s1 = reducer(undefined, cooldownUpdated(5_000));
    const s2 = reducer(
      s1,
      breakerFired({
        type: "market-move",
        scope: "symbol",
        scopeValue: "NVDA",
        observedValue: 11,
        threshold: 10,
        ts: 100,
      })
    );
    expect(s2.active[0].expiresAt).toBe(100 + 5_000);
  });

  it("breakersReconciled overwrites active list", () => {
    const s1 = reducer(
      undefined,
      breakerFired({
        type: "market-move",
        scope: "symbol",
        scopeValue: "AAPL",
        observedValue: 12,
        threshold: 10,
        ts: 1,
      })
    );
    const s2 = reducer(
      s1,
      breakersReconciled([
        {
          key: "user-pnl:user-9",
          type: "user-pnl",
          scope: "user",
          target: "user-9",
          observedValue: -60_000,
          threshold: -50_000,
          firedAt: 5,
          expiresAt: 5 + 60_000,
        },
      ])
    );
    expect(s2.active).toHaveLength(1);
    expect(s2.active[0].target).toBe("user-9");
  });
});
