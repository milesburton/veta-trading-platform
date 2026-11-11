import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fetch as undiciFetch } from "undici";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { createEgressDispatcher, installEgressProxy, isExternalHost } from "./egress-proxy.ts";

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

test("isExternalHost treats dotted names as external and bare, local and IP hosts as internal", () => {
  assert(isExternalHost("discord.com"));
  assert(isExternalHost("api.tiingo.com"));
  assert(!isExternalHost("journal"));
  assert(!isExternalHost("user-service"));
  assert(!isExternalHost("localhost"));
  assert(!isExternalHost("gateway.localhost"));
  assert(!isExternalHost("127.0.0.1"));
  assert(!isExternalHost("[::1]"));
  assert(!isExternalHost("10.0.0.5"));
});

test("createEgressDispatcher sends dotted hosts through the proxy and bare hosts direct", async () => {
  const seenByProxy: string[] = [];
  const proxy = createServer((req, res) => {
    seenByProxy.push(req.url ?? "");
    res.end("via-proxy");
  });
  const origin = createServer((_req, res) => res.end("direct"));
  const proxyPort = await listen(proxy);
  const originPort = await listen(origin);
  const dispatcher = createEgressDispatcher(`http://127.0.0.1:${proxyPort}`);
  try {
    const external = await undiciFetch("http://example.test/quote", { dispatcher });
    assertEquals(await external.text(), "via-proxy");
    assertEquals(seenByProxy, ["http://example.test/quote"]);

    const internal = await undiciFetch(`http://127.0.0.1:${originPort}/health`, { dispatcher });
    assertEquals(await internal.text(), "direct");
    assertEquals(seenByProxy.length, 1);
  } finally {
    await dispatcher.close();
    await Promise.all([closeServer(proxy), closeServer(origin)]);
  }
});

test("installEgressProxy is a no-op without EGRESS_PROXY_URL", () => {
  assertEquals(installEgressProxy({}), null);
  assertEquals(installEgressProxy({ EGRESS_PROXY_URL: "  " }), null);
});
