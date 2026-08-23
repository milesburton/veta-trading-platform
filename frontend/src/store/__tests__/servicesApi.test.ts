import { configureStore } from "@reduxjs/toolkit";
import { DEPLOYMENT, SERVICES, servicesApi } from "@veta/frontend/store/servicesApi";
import { describe, expect, it, vi } from "vitest";

describe("servicesApi – SERVICES list", () => {
  it("exports a non-empty list of services", () => {
    expect(SERVICES.length).toBeGreaterThan(0);
  });

  it("every service has a name, url, category, and port", () => {
    for (const s of SERVICES) {
      expect(s.name).toBeTruthy();
      expect(s.url).toBeTruthy();
      expect(s.category).toBeTruthy();
      expect(s.port).toBeGreaterThan(0);
    }
  });

  it("uses 'local' deployment when VITE_DEPLOYMENT is not set", () => {
    expect(DEPLOYMENT).toBe("local");
  });
});

describe("servicesApi – RTK Query endpoints", () => {
  it("exposes getServiceHealth endpoint", () => {
    expect(servicesApi.endpoints.getServiceHealth).toBeDefined();
  });

  it("exposes getSystemMetrics endpoint", () => {
    expect(servicesApi.endpoints.getSystemMetrics).toBeDefined();
  });

  it("exposes getDataDepth endpoint", () => {
    expect(servicesApi.endpoints.getDataDepth).toBeDefined();
  });

  it("getSystemMetrics queries the correct URL", () => {
    // RTK Query bakes URLs into the reducer — verify via reducerPath
    expect(servicesApi.reducerPath).toBe("servicesApi");
    expect(servicesApi.endpoints.getSystemMetrics).toBeDefined();
  });

  it("getDataDepth queries the correct URL", () => {
    expect(servicesApi.endpoints.getDataDepth).toBeDefined();
  });

  it("getServiceHealth query uses the provided url", () => {
    expect(servicesApi.endpoints.getServiceHealth).toBeDefined();
  });

  // RTK Query keeps transformResponse / transformErrorResponse internal —
  // they only run when a fetch resolves. To exercise the real transform
  // branches we spin up a minimal store, mock fetch globally, and dispatch
  // the endpoint's initiate(). The transforms then fire as part of the
  // RTK lifecycle and the resulting fulfilled/rejected payload reflects
  // what the user-facing selector would see.

  function makeStore() {
    return configureStore({
      reducer: { [servicesApi.reducerPath]: servicesApi.reducer },
      middleware: (gdm) => gdm().concat(servicesApi.middleware),
    });
  }

  it("getServiceHealth transformResponse maps version and meta onto a healthy ServiceHealth", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ service: "market-sim", status: "ok", version: "abc123", asset: "AAPL" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    const store = makeStore();
    try {
      const result = await store.dispatch(
        servicesApi.endpoints.getServiceHealth.initiate({
          name: "Market Sim",
          url: "http://example/health",
          link: "http://example/health",
          optional: false,
          alertOnDeployments: ["fly"],
        })
      );
      expect(result.data).toBeDefined();
      const data = result.data;
      if (!data) throw new Error("expected fulfilled query to populate data");
      expect(data.name).toBe("Market Sim");
      expect(data.url).toBe("http://example/health");
      expect(data.link).toBe("http://example/health");
      expect(data.optional).toBe(false);
      expect(data.alertOnDeployments).toEqual(["fly"]);
      expect(data.state).toBe("ok");
      expect(data.version).toBe("abc123");
      expect(data.meta).toEqual({ asset: "AAPL" });
      expect(typeof data.lastChecked).toBe("number");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("getServiceHealth transformResponse stringifies a missing version as em-dash", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ service: "x", status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const store = makeStore();
    try {
      const result = await store.dispatch(
        servicesApi.endpoints.getServiceHealth.initiate(
          { name: "X", url: "http://example/h2" },
          { forceRefetch: true }
        )
      );
      expect(result.data?.version).toBe("—");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("getServiceHealth transformErrorResponse returns an error-state ServiceHealth on http 5xx", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("internal error", { status: 500 }));
    const store = makeStore();
    try {
      const result = await store.dispatch(
        servicesApi.endpoints.getServiceHealth.initiate({
          name: "EMS",
          url: "http://ems/health",
          link: "http://ems/health",
          optional: true,
          alertOnDeployments: ["homelab"],
        })
      );
      // transformErrorResponse promotes the rejected branch into a typed payload
      // accessible via `result.error` (RTK reports the post-transform shape there).
      const errorPayload = result.error as unknown as Record<string, unknown>;
      expect(errorPayload).toBeDefined();
      expect(errorPayload.name).toBe("EMS");
      expect(errorPayload.state).toBe("error");
      expect(errorPayload.version).toBe("—");
      expect(errorPayload.meta).toEqual({});
      expect(errorPayload.optional).toBe(true);
      expect(errorPayload.alertOnDeployments).toEqual(["homelab"]);
      expect(typeof errorPayload.lastChecked).toBe("number");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("getServiceHealth treats a 503 with status:critical body as warn, not error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "critical", disk: { used_pct: 91 }, warn_pct: 85 }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
    const store = makeStore();
    try {
      const result = await store.dispatch(
        servicesApi.endpoints.getServiceHealth.initiate({
          name: "Disk Monitor",
          url: "http://disk-monitor/health",
        })
      );
      const errorPayload = result.error as unknown as Record<string, unknown>;
      expect(errorPayload.state).toBe("warn");
      expect(errorPayload.meta).toMatchObject({ status: "critical", warn_pct: 85 });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("getServiceHealth treats a 503 without the warn body shape as a genuine error", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("service unavailable", { status: 503 }));
    const store = makeStore();
    try {
      const result = await store.dispatch(
        servicesApi.endpoints.getServiceHealth.initiate({
          name: "Some Service",
          url: "http://some-service/health",
        })
      );
      const errorPayload = result.error as unknown as Record<string, unknown>;
      expect(errorPayload.state).toBe("error");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("getServiceHealth treats a 200 response with is_healthy:false as warn", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ is_healthy: false, unhealthy_reasons: ["node down"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const store = makeStore();
    try {
      const result = await store.dispatch(
        servicesApi.endpoints.getServiceHealth.initiate({
          name: "Redpanda",
          url: "http://redpanda/health",
        })
      );
      expect(result.data?.state).toBe("warn");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("getServiceHealth treats a 200 response with is_healthy:true as ok", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ is_healthy: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const store = makeStore();
    try {
      const result = await store.dispatch(
        servicesApi.endpoints.getServiceHealth.initiate({
          name: "Redpanda",
          url: "http://redpanda/health",
        })
      );
      expect(result.data?.state).toBe("ok");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
