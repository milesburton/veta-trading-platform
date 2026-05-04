import "https://deno.land/std@0.210.0/dotenv/load.ts";

const RELAY_HOST = Deno.env.get("KAFKA_RELAY_HOST") || "localhost";
const RELAY_PORT = Number(Deno.env.get("KAFKA_RELAY_PORT")) || 5007;
const RELAY_URL = Deno.env.get("KAFKA_RELAY_URL") ||
  `http://${RELAY_HOST}:${RELAY_PORT}`;

export async function sendDecisionEvent(
  type: string,
  payload: Record<string, unknown>,
) {
  try {
    await fetch(`${RELAY_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: `decision.${type}`, payload }),
    });
  } catch {
    // best-effort, don't crash algos on observability failures
  }
}
