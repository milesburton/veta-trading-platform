import { configureStore } from "@reduxjs/toolkit";
import { gatewayApi } from "@veta/frontend/store/gatewayApi";
import { servicesApi } from "@veta/frontend/store/servicesApi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const NativeRequest = Request;

const installRelativeRequestSupport = () =>
  vi.stubGlobal(
    "Request",
    class RequestWithBase extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        if (typeof input === "string" && input.startsWith("/")) {
          super(`http://localhost${input}`, init);
          return;
        }
        super(input, init);
      }
    }
  );

type Captured = { url: string; method: string; body: string | null };

const captured: Captured[] = [];

const stubFetch = (payload: unknown) =>
  vi.fn(async (input: Request | string) => {
    const request = input instanceof Request ? input : new Request(input);
    captured.push({
      url: new URL(request.url, "http://localhost").pathname,
      method: request.method,
      body: request.method === "GET" ? null : await request.clone().text(),
    });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

const dispatchAny = (store: ReturnType<typeof makeStore>, action: unknown) =>
  (store.dispatch as unknown as (a: unknown) => Promise<unknown>)(action);

const makeStore = () =>
  configureStore({
    reducer: {
      [gatewayApi.reducerPath]: gatewayApi.reducer,
      [servicesApi.reducerPath]: servicesApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(gatewayApi.middleware, servicesApi.middleware),
  });

beforeEach(() => {
  captured.length = 0;
  installRelativeRequestSupport();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gatewayApi requests", () => {
  it.each([
    ["getMarketHours", undefined, "/api/gateway/admin/market-hours", "GET"],
    ["getLoadGenStatus", undefined, "/api/gateway/load-gen/status", "GET"],
  ] as const)("%s requests %s", async (name, arg, path, method) => {
    vi.stubGlobal("fetch", stubFetch({}));
    const store = makeStore();
    await dispatchAny(store, gatewayApi.endpoints[name].initiate(arg));
    expect(captured[0]).toMatchObject({ url: path, method });
  });

  it("getMarketHoursMode issues a GET and parses the body against the schema", async () => {
    vi.stubGlobal("fetch", stubFetch({ mode: "invalid" }));
    const store = makeStore();
    const result = await store.dispatch(gatewayApi.endpoints.getMarketHoursMode.initiate());
    expect(captured[0]).toMatchObject({ url: "/api/gateway/market-hours", method: "GET" });
    expect(result.isError).toBe(true);
  });

  it.each([
    ["updateMarketHours", { mode: "always_open" }, "/api/gateway/admin/market-hours", "PUT"],
    ["runLoadTest", { orders: 1 }, "/api/gateway/load-test", "POST"],
    ["runDemoDay", { scenario: "x" }, "/api/gateway/demo-day", "POST"],
    ["startLoadGen", { rate: 1 }, "/api/gateway/load-gen/start", "POST"],
    ["submitBugReport", { title: "t" }, "/api/gateway/bug-report", "POST"],
    ["presignTicketAttachment", { name: "a" }, "/api/gateway/ticket-attachments/presign", "POST"],
  ] as const)("%s sends its body to the right endpoint", async (name, body, path, method) => {
    vi.stubGlobal("fetch", stubFetch({}));
    const store = makeStore();
    const endpoint = gatewayApi.endpoints[name] as unknown as {
      initiate: (arg: unknown) => Parameters<typeof store.dispatch>[0];
    };
    await store.dispatch(endpoint.initiate(body));
    expect(captured[0]).toMatchObject({ url: path, method });
    expect(JSON.parse(captured[0].body ?? "null")).toEqual(body);
  });

  it("stopLoadGen posts without a body", async () => {
    vi.stubGlobal("fetch", stubFetch({}));
    const store = makeStore();
    await store.dispatch(gatewayApi.endpoints.stopLoadGen.initiate());
    expect(captured[0]).toMatchObject({ url: "/api/gateway/load-gen/stop", method: "POST" });
  });
});

describe("servicesApi requests", () => {
  it.each([
    ["getSystemMetrics", "/api/gateway/system"],
    ["getDataDepth", "/api/gateway/data-depth"],
    ["getPlatformStatus", "/api/gateway/platform-status"],
  ] as const)("%s requests %s", async (name, path) => {
    vi.stubGlobal("fetch", stubFetch({}));
    const store = makeStore();
    await dispatchAny(store, servicesApi.endpoints[name].initiate());
    expect(captured[0]).toMatchObject({ url: path, method: "GET" });
  });

  it("getServicesStatus requests the status route and validates the schema", async () => {
    vi.stubGlobal("fetch", stubFetch({ nonsense: true }));
    const store = makeStore();
    await store.dispatch(servicesApi.endpoints.getServicesStatus.initiate());
    expect(captured[0]).toMatchObject({ url: "/api/gateway/services/status", method: "GET" });
  });

  it("submitBugReport posts JSON to the bug-report route", async () => {
    vi.stubGlobal("fetch", stubFetch({}));
    const store = makeStore();
    const body = { title: "t" } as never;
    await store.dispatch(servicesApi.endpoints.submitBugReport.initiate(body));
    expect(captured[0]).toMatchObject({ url: "/api/gateway/bug-report", method: "POST" });
  });
});
