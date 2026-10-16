import { spawn } from "node:child_process";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

const SCRIPT = new URL("../synthetic-trader/synthetic-trader.ts", import.meta.url).pathname;
const PORT = 59_431;

async function waitForHealth(): Promise<Response> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      return await fetch(`http://127.0.0.1:${PORT}/health`);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("synthetic-trader did not start serving /health");
}

test("[synthetic-trader-disabled] serves health and opens no upstream connections", async () => {
  const child = spawn(process.execPath, [SCRIPT], {
    env: {
      ...process.env,
      SYNTHETIC_TRADER_ENABLED: "false",
      SYNTHETIC_TRADER_PORT: String(PORT),
      GATEWAY_WS_URL: "ws://127.0.0.1:1/ws/gateway",
      USER_SERVICE_URL: "http://127.0.0.1:1",
      MARKET_SIM_HOST: "127.0.0.1",
      MARKET_SIM_PORT: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<void>((resolve) => child.on("close", () => resolve()));

  try {
    const res = await waitForHealth();
    assertEquals(res.status, 200);
    assertEquals((await res.json()).status, "ok");
  } finally {
    child.kill("SIGTERM");
  }

  await exited;
  assert(output.includes("disabled, serving health endpoint only"), output);
  assert(!output.includes("failed to refresh prices"), output);
  assert(!output.includes("socket"), output);
});
