import { assert, assertEquals } from "jsr:@std/assert@0.217";
import type { GatewayContext } from "../gateway/context.ts";
import { buildLoadgenMessage } from "../gateway/discord-notifier.ts";
import {
  handleLoadgenAnnounceRoute,
  parseAnnouncement,
} from "../gateway/routes/loadgen-announce.ts";

const stubContext = {} as GatewayContext;

function jsonReq(
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

Deno.test("parseAnnouncement accepts a well-formed start event", () => {
  const a = parseAnnouncement({ event: "start", runner: "soak", note: "vus=50" });
  assertEquals(a, { event: "start", runner: "soak", note: "vus=50" });
});

Deno.test("parseAnnouncement accepts a stop event without a note", () => {
  const a = parseAnnouncement({ event: "stop", runner: "matrix" });
  assertEquals(a, { event: "stop", runner: "matrix", note: undefined });
});

Deno.test("parseAnnouncement rejects unknown event values", () => {
  assertEquals(parseAnnouncement({ event: "pause", runner: "soak" }), null);
});

Deno.test("parseAnnouncement rejects empty runner", () => {
  assertEquals(parseAnnouncement({ event: "start", runner: "" }), null);
});

Deno.test("parseAnnouncement rejects non-object bodies", () => {
  assertEquals(parseAnnouncement(null), null);
  assertEquals(parseAnnouncement("hello"), null);
  assertEquals(parseAnnouncement(42), null);
});

Deno.test("buildLoadgenMessage flags noise window on start", () => {
  const msg = buildLoadgenMessage({ event: "start", runner: "soak", note: "vus=50" });
  assert(msg.includes("started"));
  assert(msg.includes("soak"));
  assert(msg.includes("vus=50"));
  assert(msg.toLowerCase().includes("disregard"));
});

Deno.test("buildLoadgenMessage announces signal-restored on stop", () => {
  const msg = buildLoadgenMessage({ event: "stop", runner: "matrix" });
  assert(msg.includes("stopped"));
  assert(msg.toLowerCase().includes("real signal"));
});

Deno.test("buildLoadgenMessage strips newlines from runner and note", () => {
  const msg = buildLoadgenMessage({
    event: "start",
    runner: "soak\n@here injected",
    note: "tricky\nbreak",
  });
  const lines = msg.split("\n");
  for (const line of lines) {
    assert(!line.startsWith("@here"));
  }
});

Deno.test("route returns null when LOADGEN_ANNOUNCE_TOKEN is unset", async () => {
  const prev = Deno.env.get("LOADGEN_ANNOUNCE_TOKEN");
  Deno.env.delete("LOADGEN_ANNOUNCE_TOKEN");
  try {
    const r = await handleLoadgenAnnounceRoute(
      jsonReq("POST", "/loadgen-announce", { event: "start", runner: "soak" }),
      "/loadgen-announce",
      stubContext
    );
    assertEquals(r, null);
  } finally {
    if (prev !== undefined) Deno.env.set("LOADGEN_ANNOUNCE_TOKEN", prev);
  }
});

Deno.test("route returns 403 when the token header is wrong", async () => {
  Deno.env.set("LOADGEN_ANNOUNCE_TOKEN", "real-token");
  try {
    const r = await handleLoadgenAnnounceRoute(
      jsonReq(
        "POST",
        "/loadgen-announce",
        { event: "start", runner: "soak" },
        {
          "X-Loadgen-Token": "wrong",
        }
      ),
      "/loadgen-announce",
      stubContext
    );
    assertEquals(r?.status, 403);
  } finally {
    Deno.env.delete("LOADGEN_ANNOUNCE_TOKEN");
  }
});

Deno.test("route returns 400 on malformed body", async () => {
  Deno.env.set("LOADGEN_ANNOUNCE_TOKEN", "real-token");
  try {
    const r = await handleLoadgenAnnounceRoute(
      jsonReq(
        "POST",
        "/loadgen-announce",
        { event: "pause", runner: "soak" },
        {
          "X-Loadgen-Token": "real-token",
        }
      ),
      "/loadgen-announce",
      stubContext
    );
    assertEquals(r?.status, 400);
  } finally {
    Deno.env.delete("LOADGEN_ANNOUNCE_TOKEN");
  }
});

Deno.test("route returns 202 when token correct but no Discord webhook", async () => {
  Deno.env.set("LOADGEN_ANNOUNCE_TOKEN", "real-token");
  const prev = Deno.env.get("DISCORD_WEBHOOK_URL");
  Deno.env.delete("DISCORD_WEBHOOK_URL");
  try {
    const r = await handleLoadgenAnnounceRoute(
      jsonReq(
        "POST",
        "/loadgen-announce",
        { event: "start", runner: "soak" },
        {
          "X-Loadgen-Token": "real-token",
        }
      ),
      "/loadgen-announce",
      stubContext
    );
    assertEquals(r?.status, 202);
    const body = await r?.json();
    assertEquals(body.ok, false);
  } finally {
    Deno.env.delete("LOADGEN_ANNOUNCE_TOKEN");
    if (prev !== undefined) Deno.env.set("DISCORD_WEBHOOK_URL", prev);
  }
});

Deno.test("route returns null for wrong path", async () => {
  Deno.env.set("LOADGEN_ANNOUNCE_TOKEN", "real-token");
  try {
    const r = await handleLoadgenAnnounceRoute(
      jsonReq("POST", "/other", { event: "start", runner: "soak" }),
      "/other",
      stubContext
    );
    assertEquals(r, null);
  } finally {
    Deno.env.delete("LOADGEN_ANNOUNCE_TOKEN");
  }
});

Deno.test("route returns null for GET method", async () => {
  Deno.env.set("LOADGEN_ANNOUNCE_TOKEN", "real-token");
  try {
    const r = await handleLoadgenAnnounceRoute(
      jsonReq("GET", "/loadgen-announce", undefined),
      "/loadgen-announce",
      stubContext
    );
    assertEquals(r, null);
  } finally {
    Deno.env.delete("LOADGEN_ANNOUNCE_TOKEN");
  }
});
