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
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs reportError payload to the kafka-relay endpoint", () => {
    const store = makeStore();
    store.dispatch(reportError({ message: "boom", source: "TestSource", stack: "trace" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/kafka-relay/events/batch");
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

  it("does not POST for unrelated actions", () => {
    const store = makeStore();
    store.dispatch({ type: "test/noop" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows transport errors so the app keeps running", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const store = makeStore();
    expect(() =>
      store.dispatch(reportError({ message: "still works", source: "x" }))
    ).not.toThrow();
  });
});
