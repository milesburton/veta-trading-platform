import { describe, expect, it } from "vitest";
import { type FeedState, feedReceived, feedSlice } from "../feedSlice";

const { reducer } = feedSlice;

const empty: FeedState = {
  lastSeenAt: { market: null, orders: null, algo: null, news: null },
};

describe("feedSlice", () => {
  it("initialises all sources as null", () => {
    const state = reducer(undefined, { type: "@@INIT" });
    expect(state.lastSeenAt.market).toBeNull();
    expect(state.lastSeenAt.orders).toBeNull();
    expect(state.lastSeenAt.algo).toBeNull();
    expect(state.lastSeenAt.news).toBeNull();
  });

  it("stamps the named source on feedReceived", () => {
    const before = Date.now();
    const state = reducer(empty, feedReceived("market"));
    const after = Date.now();
    expect(state.lastSeenAt.market).toBeGreaterThanOrEqual(before);
    expect(state.lastSeenAt.market).toBeLessThanOrEqual(after);
  });

  it("only updates the dispatched source", () => {
    const state = reducer(empty, feedReceived("algo"));
    expect(state.lastSeenAt.market).toBeNull();
    expect(state.lastSeenAt.orders).toBeNull();
    expect(state.lastSeenAt.news).toBeNull();
    expect(state.lastSeenAt.algo).not.toBeNull();
  });

  it("updates each source independently", () => {
    let state = reducer(empty, feedReceived("market"));
    state = reducer(state, feedReceived("orders"));
    expect(state.lastSeenAt.market).not.toBeNull();
    expect(state.lastSeenAt.orders).not.toBeNull();
    expect(state.lastSeenAt.algo).toBeNull();
    expect(state.lastSeenAt.news).toBeNull();
  });
});
