// fallow-ignore-file unused-file
import { assertEquals } from "jsr:@std/assert@0.217";
import {
  _internalForTests,
  lookupPanel,
  renderGrafanaPanel,
} from "../gateway/grafana-renderer.ts";

const realFetch = globalThis.fetch;

Deno.test("lookupPanel maps known sources to specific panels", () => {
  const killSwitch = lookupPanel("kill-switch");
  assertEquals(killSwitch?.panelUid, "trading");
  assertEquals(killSwitch?.panelId, 1);

  const algo = lookupPanel("twap-algo");
  assertEquals(algo?.panelUid, "trading");
  assertEquals(algo?.panelId, 5);

  const http = lookupPanel("http-latency");
  assertEquals(http?.panelUid, "veta-services-otel");
});

Deno.test("lookupPanel uses the *-algo convention for unmapped algo sources", () => {
  const made_up = lookupPanel("some-new-algo");
  assertEquals(made_up?.panelUid, "trading");
  assertEquals(made_up?.panelId, 5);
});

Deno.test("lookupPanel returns the default panel for unknown sources", () => {
  const unknown = lookupPanel("never-heard-of-it");
  assertEquals(unknown?.panelUid, "trading");
  assertEquals(unknown?.panelId, 1);
});

Deno.test("lookupPanel handles undefined source by returning the default", () => {
  const undef = lookupPanel(undefined);
  assertEquals(undef?.panelUid, "trading");
});

Deno.test("buildRenderUrl uses the configured Grafana base URL", () => {
  const prev = Deno.env.get("GRAFANA_INTERNAL_URL");
  Deno.env.set("GRAFANA_INTERNAL_URL", "http://custom-host:9000/grafana");
  try {
    const url = _internalForTests.buildRenderUrl({ panelUid: "trading", panelId: 7 });
    assertEquals(url.startsWith("http://custom-host:9000/grafana/render/d-solo/trading?"), true);
    const params = new URL(url).searchParams;
    assertEquals(params.get("panelId"), "7");
    assertEquals(params.get("from"), "now-15m");
    assertEquals(params.get("to"), "now");
    assertEquals(params.get("theme"), "dark");
  } finally {
    if (prev === undefined) Deno.env.delete("GRAFANA_INTERNAL_URL");
    else Deno.env.set("GRAFANA_INTERNAL_URL", prev);
  }
});

Deno.test("buildRenderUrl honours width/height/window/theme overrides", () => {
  const url = _internalForTests.buildRenderUrl({
    panelUid: "trading",
    panelId: 1,
    width: 1200,
    height: 600,
    fromMinutesAgo: 60,
    theme: "light",
  });
  const params = new URL(url).searchParams;
  assertEquals(params.get("width"), "1200");
  assertEquals(params.get("height"), "600");
  assertEquals(params.get("from"), "now-60m");
  assertEquals(params.get("theme"), "light");
});

Deno.test("renderGrafanaPanel returns null when fetch errors", async () => {
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
  try {
    const bytes = await renderGrafanaPanel({ panelUid: "trading", panelId: 1 });
    assertEquals(bytes, null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("renderGrafanaPanel returns null when content-type is not an image", async () => {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response("not an image", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    )) as typeof fetch;
  try {
    const bytes = await renderGrafanaPanel({ panelUid: "trading", panelId: 1 });
    assertEquals(bytes, null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("renderGrafanaPanel returns the PNG bytes on success", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(png as BodyInit, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    )) as typeof fetch;
  try {
    const bytes = await renderGrafanaPanel({ panelUid: "trading", panelId: 1 });
    assertEquals(bytes !== null, true);
    assertEquals(bytes?.byteLength, 4);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("renderGrafanaPanel returns null when DISCORD_ATTACH_GRAFANA_PANELS=false", async () => {
  Deno.env.set("DISCORD_ATTACH_GRAFANA_PANELS", "false");
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;
  try {
    const bytes = await renderGrafanaPanel({ panelUid: "trading", panelId: 1 });
    assertEquals(bytes, null);
    assertEquals(fetchCalled, false);
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete("DISCORD_ATTACH_GRAFANA_PANELS");
  }
});

Deno.test("renderGrafanaPanel rejects oversized payloads", async () => {
  // 7 MB payload, over the 6 MB cap
  const oversized = new Uint8Array(7 * 1024 * 1024);
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(oversized as BodyInit, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    )) as typeof fetch;
  try {
    const bytes = await renderGrafanaPanel({ panelUid: "trading", panelId: 1 });
    assertEquals(bytes, null);
  } finally {
    globalThis.fetch = realFetch;
  }
});
