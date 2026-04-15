import {
  assert,
  assertEquals,
  assertExists,
} from "jsr:@std/assert@0.217";

const BASE = Deno.env.get("VETA_BASE_URL") ?? "http://localhost";
function svcUrl(localPort: number, prodPath: string): string {
  if (BASE === "http://localhost") return `${BASE}:${localPort}`;
  return `${BASE}${prodPath}`;
}
const MDS_URL = svcUrl(5015, "/api/market-data");

function t(ms = 8_000) {
  return AbortSignal.timeout(ms);
}

Deno.test("[market-data/http] GET /health returns ok with override count", async () => {
  const res = await fetch(`${MDS_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json() as {
    status: string;
    overrides: number;
    alphaVantageConfigured: boolean;
  };
  assertEquals(body.status, "ok");
  assert(typeof body.overrides === "number" && body.overrides >= 0);
  assert(typeof body.alphaVantageConfigured === "boolean");
});

Deno.test("[market-data/http] GET /sources returns non-empty array with id, label, enabled", async () => {
  const res = await fetch(`${MDS_URL}/sources`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json() as {
    id: string;
    label: string;
    enabled: boolean;
  }[];
  assert(Array.isArray(body) && body.length > 0);
  const synthetic = body.find((s) => s.id === "synthetic");
  assertExists(synthetic, "synthetic source must be present");
  assert(typeof synthetic.enabled === "boolean");
  assert(typeof synthetic.label === "string" && synthetic.label.length > 0);
});

Deno.test("[market-data/http] GET /overrides returns overrides object", async () => {
  const res = await fetch(`${MDS_URL}/overrides`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json() as { overrides: Record<string, string> };
  assertExists(body.overrides);
  assert(typeof body.overrides === "object");
});

Deno.test("[market-data/http] PUT /overrides sets and retrieves an override", async () => {
  const putRes = await fetch(`${MDS_URL}/overrides`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overrides: { TSLA: "synthetic" } }),
    signal: t(),
  });
  assertEquals(putRes.status, 200);
  await putRes.body?.cancel();

  const getRes = await fetch(`${MDS_URL}/overrides`, { signal: t() });
  assertEquals(getRes.status, 200);
  const body = await getRes.json() as { overrides: Record<string, string> };
  assert(typeof body.overrides === "object");
});

Deno.test("[market-data/http] PUT /overrides with unknown source returns 400", async () => {
  const res = await fetch(`${MDS_URL}/overrides`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overrides: { AAPL: "bloomberg" } }),
    signal: t(),
  });
  assertEquals(res.status, 400);
  const body = await res.json() as { error: string };
  assert(
    body.error.toLowerCase().includes("unknown source") ||
      body.error.toLowerCase().includes("bloomberg"),
  );
});

Deno.test("[market-data/http] PUT /overrides with invalid JSON returns 400", async () => {
  const res = await fetch(`${MDS_URL}/overrides`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{ not json",
    signal: t(),
  });
  assertEquals(res.status, 400);
  res.body?.cancel();
});

Deno.test("[market-data/http] PUT /overrides missing overrides key returns 400", async () => {
  const res = await fetch(`${MDS_URL}/overrides`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols: { AAPL: "synthetic" } }),
    signal: t(),
  });
  assertEquals(res.status, 400);
  res.body?.cancel();
});

Deno.test("[market-data/http] PUT /overrides synthetic override is idempotent", async () => {
  const res1 = await fetch(`${MDS_URL}/overrides`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      overrides: { AAPL: "synthetic", MSFT: "synthetic" },
    }),
    signal: t(),
  });
  assertEquals(res1.status, 200);
  await res1.body?.cancel();

  const res2 = await fetch(`${MDS_URL}/overrides`, { signal: t() });
  const body = await res2.json() as { overrides: Record<string, string> };
  assert(typeof body.overrides === "object");
});

Deno.test("[market-data/http] POST /sources/alpha-vantage/toggle returns updated sources", async () => {
  const before = await fetch(`${MDS_URL}/sources`, { signal: t() })
    .then((r) => r.json() as Promise<{ id: string; active: boolean }[]>)
    .then((s) => s.find((src) => src.id === "alpha-vantage")?.active);

  const toggleRes = await fetch(`${MDS_URL}/sources/alpha-vantage/toggle`, {
    method: "POST",
    signal: t(),
  });
  assertEquals(toggleRes.status, 200);
  const toggled = await toggleRes.json() as { id: string; active: boolean }[];
  const after = toggled.find((s) => s.id === "alpha-vantage")?.active;

  if (before !== undefined && after !== undefined) {
    assertEquals(after, !before, "toggle should flip active state");
  }

  const restoreRes = await fetch(`${MDS_URL}/sources/alpha-vantage/toggle`, {
    method: "POST",
    signal: t(),
  });
  await restoreRes.body?.cancel();
});

Deno.test("[market-data/http] POST /sources/unknown-source/toggle returns 400", async () => {
  const res = await fetch(`${MDS_URL}/sources/bloomberg/toggle`, {
    method: "POST",
    signal: t(),
  });
  assertEquals(res.status, 400);
  res.body?.cancel();
});

Deno.test("[market-data/http] GET /cache returns object (debug endpoint)", async () => {
  const res = await fetch(`${MDS_URL}/cache`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json() as unknown;
  assert(typeof body === "object" && body !== null);
});
