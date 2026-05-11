import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observabilitySlice, reportError } from "../../observabilitySlice";
import { errorTransportMiddleware } from "../errorTransportMiddleware";

function makeStore() {
  return configureStore({
    reducer: { observability: observabilitySlice.reducer },
    middleware: (m) => m().concat(errorTransportMiddleware),
  });
}

describe("errorTransportMiddleware", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("POSTs reportError payload to the kafka-relay endpoint after debounce", async () => {
    const store = makeStore();
    store.dispatch(reportError({ message: "boom", source: "TestSource", stack: "trace" }));
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/gateway/api/kafka-relay/events/batch");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].type).toBe("client.error");
    expect(body.events[0].payload).toMatchObject({
      message: "boom",
      source: "TestSource",
      stack: "trace",
    });
  });

  it("batches consecutive reportError dispatches into a single POST", async () => {
    const store = makeStore();
    store.dispatch(reportError({ message: "one", source: "TestSource" }));
    store.dispatch(reportError({ message: "two", source: "TestSource" }));
    store.dispatch(reportError({ message: "three", source: "TestSource" }));
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.events).toHaveLength(3);
    expect(body.events.map((e: { payload: { message: string } }) => e.payload.message)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("flushes immediately when batch hits the cap", async () => {
    const store = makeStore();
    for (let i = 0; i < 20; i++) {
      store.dispatch(reportError({ message: `msg ${i}`, source: "TestSource" }));
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.events).toHaveLength(20);
  });

  it("does not POST for unrelated actions", async () => {
    const store = makeStore();
    store.dispatch({ type: "test/noop" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows transport errors so the app keeps running", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const store = makeStore();
    expect(() =>
      store.dispatch(reportError({ message: "still works", source: "x" }))
    ).not.toThrow();
    await vi.advanceTimersByTimeAsync(500);
  });
});
