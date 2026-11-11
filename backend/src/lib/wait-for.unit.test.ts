import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { waitForUrl } from "./wait-for.ts";

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

test("[wait-for] returns true when both tcp and http probes succeed", async () => {
  const server = createServer((_req, res) => {
    res.statusCode = 200;
    res.end("ok");
  });
  const port = await listen(server);
  try {
    const ok = await waitForUrl(`http://127.0.0.1:${port}/health`, {
      intervalMs: 5,
      timeoutMs: 300,
      onAttemptMs: 100,
    });
    assertEquals(ok, true);
  } finally {
    await close(server);
  }
});

test("[wait-for] returns false when tcp is open but http status is not ok", async () => {
  const server = createServer((_req, res) => {
    res.statusCode = 503;
    res.end("unavailable");
  });
  const port = await listen(server);
  try {
    const ok = await waitForUrl(`http://127.0.0.1:${port}/health`, {
      intervalMs: 10,
      timeoutMs: 120,
      onAttemptMs: 60,
    });
    assertEquals(ok, false);
  } finally {
    await close(server);
  }
});

test("[wait-for] returns false when the tcp probe cannot connect", async () => {
  const probe = createServer();
  const port = await listen(probe);
  await close(probe);

  const ok = await waitForUrl(`http://127.0.0.1:${port}/health`, {
    intervalMs: 10,
    timeoutMs: 120,
    onAttemptMs: 60,
  });
  assertEquals(ok, false);
});
