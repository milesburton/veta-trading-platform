import { CORS_HEADERS } from "@veta/http";

export interface DiskStatus {
  total: number;
  used: number;
  available: number;
  percentUsed: number;
}

export async function getDiskUsage(): Promise<DiskStatus | null> {
  try {
    const proc = new Deno.Command("df", {
      args: ["-Pk", "/"],
      stdout: "piped",
      stderr: "null",
    });
    const { code, stdout } = await proc.output();
    if (code !== 0) return null;
    const lines = new TextDecoder().decode(stdout).trim().split("\n");
    if (lines.length < 2) return null;
    const cols = lines[1].split(/\s+/);
    const totalKb = Number(cols[1]);
    const usedKb = Number(cols[2]);
    const availKb = Number(cols[3]);
    if (totalKb <= 0) return null;
    return {
      total: totalKb * 1024,
      used: usedKb * 1024,
      available: availKb * 1024,
      percentUsed: (usedKb / totalKb) * 100,
    };
  } catch {
    return null;
  }
}

export function diskStatusLabel(disk: DiskStatus | null): string {
  if (!disk) return "unavailable";
  if (disk.percentUsed > 95) return "critical";
  if (disk.percentUsed > 85) return "warning";
  return "ok";
}

export async function handleSystemStatus(): Promise<Response> {
  const disk = await getDiskUsage();
  const mem = Deno.memoryUsage();
  return new Response(
    JSON.stringify({
      disk,
      diskStatus: diskStatusLabel(disk),
      diskWarnPct: 85,
      memory: {
        rss_mb: Math.round(mem.rss / 1_048_576),
        heap_used_mb: Math.round(mem.heapUsed / 1_048_576),
        heap_total_mb: Math.round(mem.heapTotal / 1_048_576),
        external_mb: Math.round(mem.external / 1_048_576),
      },
    }),
    { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
  );
}

export function handleHealth(version: string): Response {
  return new Response(JSON.stringify({ service: "gateway", version, status: "ok" }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export function makeMarketSimWsProxy(req: Request, marketSimPort: number): Response {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }
  const { socket: client, response } = Deno.upgradeWebSocket(req, { idleTimeout: 300 });
  const upstream = new WebSocket(`ws://localhost:${marketSimPort}`);
  upstream.onmessage = (ev) => {
    try {
      if (client.readyState === WebSocket.OPEN) client.send(ev.data);
    } catch {
      /* ignore */
    }
  };
  upstream.onclose = () => {
    try {
      client.close();
    } catch {
      /* ignore */
    }
  };
  upstream.onerror = () => {
    try {
      client.close();
    } catch {
      /* ignore */
    }
  };
  client.onmessage = (ev) => {
    try {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(ev.data);
    } catch {
      /* ignore */
    }
  };
  client.onclose = () => {
    try {
      upstream.close();
    } catch {
      /* ignore */
    }
  };
  client.onerror = () => {
    try {
      upstream.close();
    } catch {
      /* ignore */
    }
  };
  return response;
}
