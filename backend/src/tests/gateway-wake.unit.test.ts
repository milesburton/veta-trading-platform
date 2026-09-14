import { assertEquals } from "jsr:@std/assert@0.217";
import type { ServiceSpec } from "../../../shared/serviceRegistry.ts";
import { isConnectionRefused, proxyWithWake, startingResponse } from "../gateway/wake.ts";

const noopCors = () => ({});

function specMap(overrides: Partial<Record<string, ServiceSpec>> = {}): Map<string, ServiceSpec> {
  return new Map(Object.entries(overrides)) as Map<string, ServiceSpec>;
}

function badGateway(): Response {
  return new Response(JSON.stringify({ error: "connect refused" }), { status: 502 });
}

function ok(): Response {
  return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
}

Deno.test("[isConnectionRefused] true only for a 502", () => {
  assertEquals(isConnectionRefused(new Response(null, { status: 502 })), true);
  assertEquals(isConnectionRefused(new Response(null, { status: 200 })), false);
  assertEquals(isConnectionRefused(new Response(null, { status: 503 })), false);
  assertEquals(isConnectionRefused(new Response(null, { status: 404 })), false);
});

Deno.test("[startingResponse] returns 503 with status:starting and applies corsHeaders", () => {
  const req = new Request("http://localhost/api/analytics/quote");
  const res = startingResponse(req, () => ({ "X-Test": "1" }));
  assertEquals(res.status, 503);
  assertEquals(res.headers.get("X-Test"), "1");
});

Deno.test("[proxyWithWake] passes through immediately when the first call succeeds", async () => {
  let calls = 0;
  const proxyFn = () => {
    calls++;
    return Promise.resolve(ok());
  };
  const req = new Request("http://localhost/api/analytics/quote");
  const isProgramRunningFn = () => Promise.resolve(true);
  const startProgramFn = () => Promise.resolve({ ok: true, output: "" });

  const res = await proxyWithWake("analytics", proxyFn, req, specMap(), noopCors, {
    isProgramRunningFn,
    startProgramFn,
  });

  assertEquals(res.status, 200);
  assertEquals(calls, 1, "must not retry when the first attempt already succeeded");
});

Deno.test("[proxyWithWake] wakes the program and retries until it succeeds", async () => {
  let calls = 0;
  const proxyFn = () => {
    calls++;
    return Promise.resolve(calls < 3 ? badGateway() : ok());
  };
  const startCalls: string[] = [];
  const req = new Request("http://localhost/api/analytics/quote");

  const res = await proxyWithWake(
    "analytics",
    proxyFn,
    req,
    specMap(),
    noopCors,
    {
      retryDelaysMs: [0, 0, 0, 0, 0],
      sleep: () => Promise.resolve(),
      isProgramRunningFn: () => Promise.resolve(false),
      startProgramFn: (program) => {
        startCalls.push(program);
        return Promise.resolve({ ok: true, output: "" });
      },
    }
  );

  assertEquals(res.status, 200);
  assertEquals(calls, 3, "1 initial failed attempt + 2 retries before success");
  assertEquals(startCalls, ["analytics"], "must start the program exactly once");
});

Deno.test("[proxyWithWake] does not call startProgram when already running", async () => {
  let calls = 0;
  const proxyFn = () => {
    calls++;
    return Promise.resolve(calls < 2 ? badGateway() : ok());
  };
  const startCalls: string[] = [];
  const req = new Request("http://localhost/api/analytics/quote");

  await proxyWithWake("analytics", proxyFn, req, specMap(), noopCors, {
    retryDelaysMs: [0, 0],
    sleep: () => Promise.resolve(),
    isProgramRunningFn: () => Promise.resolve(true),
    startProgramFn: (program) => {
      startCalls.push(program);
      return Promise.resolve({ ok: true, output: "" });
    },
  });

  assertEquals(startCalls, [], "already running — startProgram must not be called");
});

Deno.test("[proxyWithWake] returns a starting response after exhausting all retries", async () => {
  const proxyFn = () => Promise.resolve(badGateway());
  const req = new Request("http://localhost/api/analytics/quote");

  const res = await proxyWithWake("analytics", proxyFn, req, specMap(), noopCors, {
    retryDelaysMs: [0, 0, 0],
    sleep: () => Promise.resolve(),
    isProgramRunningFn: () => Promise.resolve(false),
    startProgramFn: () => Promise.resolve({ ok: true, output: "" }),
  });

  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.status, "starting");
});

Deno.test("[proxyWithWake] resolves the supervisorProgram override from the registry spec", async () => {
  let calls = 0;
  const proxyFn = () => {
    calls++;
    return Promise.resolve(calls < 2 ? badGateway() : ok());
  };
  const startCalls: string[] = [];
  const req = new Request("http://localhost/api/market-data/quote");
  const specs = specMap({
    "market-data": { supervisorProgram: "market-data-service" } as ServiceSpec,
  });

  await proxyWithWake("market-data", proxyFn, req, specs, noopCors, {
    retryDelaysMs: [0],
    sleep: () => Promise.resolve(),
    isProgramRunningFn: () => Promise.resolve(false),
    startProgramFn: (program) => {
      startCalls.push(program);
      return Promise.resolve({ ok: true, output: "" });
    },
  });

  assertEquals(startCalls, ["market-data-service"]);
});

Deno.test("[proxyWithWake] falls back to the compose name when no supervisorProgram override exists", async () => {
  let calls = 0;
  const proxyFn = () => {
    calls++;
    return Promise.resolve(calls < 2 ? badGateway() : ok());
  };
  const startCalls: string[] = [];
  const req = new Request("http://localhost/api/analytics/quote");

  await proxyWithWake("analytics", proxyFn, req, specMap(), noopCors, {
    retryDelaysMs: [0],
    sleep: () => Promise.resolve(),
    isProgramRunningFn: () => Promise.resolve(false),
    startProgramFn: (program) => {
      startCalls.push(program);
      return Promise.resolve({ ok: true, output: "" });
    },
  });

  assertEquals(startCalls, ["analytics"]);
});
