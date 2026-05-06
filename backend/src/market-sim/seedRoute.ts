import { CORS_HEADERS } from "@veta/http";
import { currentSeed, seedRng } from "./rng.ts";

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

export async function handleSeedRoute(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return json(200, { seed: currentSeed() });
  }

  if (req.method === "POST") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const seed = (body as { seed?: unknown })?.seed;
    if (seed === null) {
      seedRng(null);
      return json(200, { seed: null });
    }
    if (typeof seed !== "number" || !Number.isFinite(seed)) {
      return json(400, { error: "seed must be a finite number or null" });
    }
    seedRng(seed | 0);
    return json(200, { seed: currentSeed() });
  }

  return json(405, { error: "Method not allowed" });
}
