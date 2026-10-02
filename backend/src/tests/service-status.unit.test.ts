import { assertEquals } from "jsr:@std/assert@0.217";
import type { ServiceSpec } from "../../../shared/serviceRegistry.ts";
import {
  buildServicesStatus,
  pollServices,
  probe,
  toHealthFlags,
} from "../gateway/service-status.ts";

function spec(overrides: Partial<ServiceSpec>): ServiceSpec {
  return {
    id: "svc",
    displayName: "Svc",
    envPrefix: "SVC",
    composeName: "svc",
    defaultPort: 1,
    category: "core",
    description: "",
    tier: 0,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

Deno.test("[probe] a 2xx becomes ok with its body", async () => {
  const result = await probe("http://x/health", 1_000, () =>
    Promise.resolve(jsonResponse(200, { version: "abc" }))
  );
  assertEquals(result, { kind: "ok", body: { version: "abc" } });
});

Deno.test("[probe] a non-2xx keeps its status and body", async () => {
  const result = await probe("http://x/health", 1_000, () =>
    Promise.resolve(jsonResponse(503, { status: "starting" }))
  );
  assertEquals(result, { kind: "http", status: 503, body: { status: "starting" } });
});

Deno.test("[probe] a non-JSON body is treated as empty", async () => {
  const result = await probe("http://x/health", 1_000, () =>
    Promise.resolve(new Response("OK", { status: 200 }))
  );
  assertEquals(result, { kind: "ok", body: {} });
});

Deno.test("[probe] a network failure is unreachable, whether refused or a DNS failure", async () => {
  for (const message of [
    "Connection refused (os error 111)",
    "dns error: failed to lookup address",
  ]) {
    const result = await probe("http://x/health", 1_000, () =>
      Promise.reject(new TypeError(message))
    );
    assertEquals(result, { kind: "unreachable" });
  }
});

Deno.test("[probe] a timeout is reported as timeout", async () => {
  const result = await probe("http://x/health", 1_000, () =>
    Promise.reject(new DOMException("Signal timed out.", "TimeoutError"))
  );
  assertEquals(result, { kind: "timeout" });
});

Deno.test("[pollServices] classifies each target and strips status fields from meta", async () => {
  const fetchFn = (url: string) =>
    url.startsWith("http://up")
      ? Promise.resolve(
          jsonResponse(200, { version: "v1", service: "up", status: "ok", uptime: 5 })
        )
      : Promise.reject(new TypeError("Connection refused"));
  const entries = await pollServices(
    [
      { spec: spec({ id: "up", composeName: "up" }), url: "http://up/health" },
      { spec: spec({ id: "algo", composeName: "algo", tier: 2 }), url: "http://algo/health" },
      { spec: spec({ id: "core", composeName: "core" }), url: "http://core/health" },
    ],
    1_000,
    fetchFn,
    () => 42
  );
  assertEquals(
    entries.map((e) => [e.id, e.status, e.version, e.meta, e.checkedAt]),
    [
      ["up", "ok", "v1", { uptime: 5 }, 42],
      ["algo", "standby", "—", {}, 42],
      ["core", "error", "—", {}, 42],
    ]
  );
});

Deno.test("[buildServicesStatus] lists the gateway first and only frontend-visible services", async () => {
  const entries = await pollServices(
    [
      { spec: spec({ id: "a", composeName: "a" }), url: "http://a" },
      {
        spec: spec({ id: "hidden", composeName: "hidden", excludeFromFrontendServices: true }),
        url: "http://h",
      },
    ],
    1_000,
    () => Promise.resolve(jsonResponse(200, {})),
    () => 1
  );
  const payload = buildServicesStatus("sha", entries, 7);
  assertEquals(
    payload.services.map((s) => s.id),
    ["gateway", "a"]
  );
  assertEquals(payload.counts.total, 2);
  assertEquals(payload.counts.ok, 2);
  assertEquals(payload.commit, "sha");
  assertEquals(payload.checkedAt, 7);
});

Deno.test("[toHealthFlags] counts ok and standby as up, everything else as down", async () => {
  const fetchFn = (url: string) =>
    url === "http://ok"
      ? Promise.resolve(jsonResponse(200, {}))
      : Promise.reject(new TypeError("Connection refused"));
  const entries = await pollServices(
    [
      { spec: spec({ id: "ok" }), url: "http://ok" },
      { spec: spec({ id: "standby", tier: 1 }), url: "http://down" },
      { spec: spec({ id: "error" }), url: "http://down" },
    ],
    1_000,
    fetchFn
  );
  assertEquals(toHealthFlags(entries), { ok: true, standby: true, error: false });
});
