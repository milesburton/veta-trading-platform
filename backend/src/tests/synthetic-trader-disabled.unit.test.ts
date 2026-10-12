import { assert, assertEquals } from "jsr:@std/assert@0.217";

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

Deno.test("[synthetic-trader-disabled] serves health and opens no upstream connections", async () => {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-all", SCRIPT],
    env: {
      SYNTHETIC_TRADER_ENABLED: "false",
      SYNTHETIC_TRADER_PORT: String(PORT),
      GATEWAY_WS_URL: "ws://127.0.0.1:1/ws/gateway",
      USER_SERVICE_URL: "http://127.0.0.1:1",
      MARKET_SIM_HOST: "127.0.0.1",
      MARKET_SIM_PORT: "1",
    },
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  try {
    const res = await waitForHealth();
    assertEquals(res.status, 200);
    assertEquals((await res.json()).status, "ok");
  } finally {
    child.kill("SIGTERM");
  }

  const { stdout, stderr } = await child.output();
  const output = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
  assert(output.includes("disabled, serving health endpoint only"), output);
  assert(!output.includes("failed to refresh prices"), output);
  assert(!output.includes("socket"), output);
});
