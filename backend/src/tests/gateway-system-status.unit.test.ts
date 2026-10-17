import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

interface FakeSocket {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onmessage?: (ev: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
}

const run = vi.hoisted(() => ({ runCommand: vi.fn() }));
const client = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("../lib/process.ts", () => run);
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  upgradeWebSocket: () => ({
    socket: client.current,
    response: new Response(null, { status: 200 }),
  }),
}));

const { diskStatusLabel, getDiskUsage, handleHealth, handleSystemStatus, makeMarketSimWsProxy } =
  await import("../gateway/system-status.ts");

const DF = "Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/sda1 1000 400 600 40% /\n";

function fakeSocket(readyState = WebSocket.OPEN): FakeSocket {
  return { readyState, send: vi.fn(), close: vi.fn() };
}

let upstreams: FakeSocket[];

beforeEach(() => {
  run.runCommand.mockReset();
  upstreams = [];
  vi.stubGlobal(
    "WebSocket",
    Object.assign(
      function FakeWebSocket(this: unknown, url: string) {
        const s = fakeSocket();
        Object.assign(s, { url });
        upstreams.push(s);
        return s;
      },
      { OPEN: 1 }
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("[system-status] parses df output into byte counts", async () => {
  run.runCommand.mockResolvedValue({ code: 0, stdout: DF, stderr: "" });
  assertEquals(await getDiskUsage(), {
    total: 1000 * 1024,
    used: 400 * 1024,
    available: 600 * 1024,
    percentUsed: 40,
  });
  assertEquals(run.runCommand.mock.calls[0], ["df", ["-Pk", "/"]]);
});

test("[system-status] disk usage is null for failures and unusable output", async () => {
  run.runCommand.mockResolvedValue({ code: 1, stdout: DF, stderr: "" });
  assertEquals(await getDiskUsage(), null);
  run.runCommand.mockResolvedValue({ code: 0, stdout: "header only", stderr: "" });
  assertEquals(await getDiskUsage(), null);
  run.runCommand.mockResolvedValue({
    code: 0,
    stdout: "h\n/dev/x 0 0 0 0% /",
    stderr: "",
  });
  assertEquals(await getDiskUsage(), null);
  run.runCommand.mockRejectedValue(new Error("no df"));
  assertEquals(await getDiskUsage(), null);
});

test("[system-status] labels disk pressure by threshold", () => {
  const disk = (percentUsed: number) => ({ total: 1, used: 1, available: 1, percentUsed });
  assertEquals(diskStatusLabel(null), "unavailable");
  assertEquals(diskStatusLabel(disk(85)), "ok");
  assertEquals(diskStatusLabel(disk(86)), "warning");
  assertEquals(diskStatusLabel(disk(95)), "warning");
  assertEquals(diskStatusLabel(disk(96)), "critical");
});

test("[system-status] reports disk and process memory as JSON", async () => {
  run.runCommand.mockResolvedValue({ code: 0, stdout: DF, stderr: "" });
  const body = await handleSystemStatus().then((r) => r.json());
  assertEquals(body.diskStatus, "ok");
  assertEquals(body.diskWarnPct, 85);
  assertEquals(body.disk.percentUsed, 40);
  assert(body.memory.rss_mb > 0);
  assert(body.memory.heap_used_mb > 0);
});

test("[system-status] reports health with the build version", async () => {
  const res = handleHealth("abc123");
  assertEquals(await res.json(), { service: "gateway", version: "abc123", status: "ok" });
});

test("[system-status] the market-sim proxy demands a websocket upgrade", () => {
  const res = makeMarketSimWsProxy(new Request("http://gw/ws/market"), 5000);
  assertEquals(res.status, 426);
  assertEquals(upstreams.length, 0);
});

test("[system-status] the market-sim proxy relays frames both ways while open", () => {
  const downstream = fakeSocket();
  client.current = downstream;
  const res = makeMarketSimWsProxy(
    new Request("http://gw/ws/market", { headers: { upgrade: "websocket" } }),
    5123
  );
  assertEquals(res.status, 200);
  const upstream = upstreams[0];
  assertEquals((upstream as unknown as { url: string }).url, "ws://localhost:5123");

  upstream.onmessage?.({ data: "tick" });
  assertEquals(downstream.send.mock.calls[0], ["tick"]);
  downstream.onmessage?.({ data: "sub" });
  assertEquals(upstream.send.mock.calls[0], ["sub"]);

  downstream.readyState = WebSocket.OPEN + 1;
  upstream.onmessage?.({ data: "late" });
  assertEquals(downstream.send.mock.calls.length, 1);
  upstream.readyState = WebSocket.OPEN + 1;
  downstream.onmessage?.({ data: "late" });
  assertEquals(upstream.send.mock.calls.length, 1);
});

test("[system-status] closing either side closes the other, and send failures are swallowed", () => {
  const downstream = fakeSocket();
  client.current = downstream;
  makeMarketSimWsProxy(
    new Request("http://gw/ws/market", { headers: { upgrade: "websocket" } }),
    5000
  );
  const upstream = upstreams[0];

  upstream.onclose?.();
  assertEquals(downstream.close.mock.calls.length, 1);
  upstream.onerror?.();
  assertEquals(downstream.close.mock.calls.length, 2);
  downstream.onclose?.();
  assertEquals(upstream.close.mock.calls.length, 1);
  downstream.onerror?.();
  assertEquals(upstream.close.mock.calls.length, 2);

  downstream.send.mockImplementation(() => {
    throw new Error("closed");
  });
  upstream.send.mockImplementation(() => {
    throw new Error("closed");
  });
  downstream.close.mockImplementation(() => {
    throw new Error("closed");
  });
  upstream.close.mockImplementation(() => {
    throw new Error("closed");
  });
  upstream.onmessage?.({ data: "x" });
  downstream.onmessage?.({ data: "x" });
  upstream.onclose?.();
  upstream.onerror?.();
  downstream.onclose?.();
  downstream.onerror?.();
});
