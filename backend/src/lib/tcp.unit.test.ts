import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { test } from "#veta/test";
import { assertEquals, assertRejects } from "#veta/test-assert";
import { connectTcp } from "./tcp.ts";

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

test("[tcp] connectTcp resolves with an open socket", async () => {
  const server = createServer((socket) => socket.end());
  const port = await listen(server);
  try {
    const socket = await connectTcp("127.0.0.1", port);
    assertEquals(socket.remotePort, port);
    socket.destroy();
  } finally {
    await close(server);
  }
});

test("[tcp] connectTcp rejects when the host:port is unavailable", async () => {
  const server = createServer();
  const port = await listen(server);
  await close(server);
  await assertRejects(() => connectTcp("127.0.0.1", port));
});
