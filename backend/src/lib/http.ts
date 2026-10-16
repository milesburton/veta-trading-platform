import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { serve, type ServerType } from "@hono/node-server";
import { WebSocketServer } from "ws";
import type { ZodTypeAny, z } from "zod";
import { trackHttpServerRequest } from "./telemetry.ts";

// docs: /reference/api-gateway/
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
};

export function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...(extra ?? {}) },
  });
}

export function decodePathSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function jsonError(error: string, status = 400, extra?: Record<string, string>): Response {
  return json({ error }, status, extra);
}

export function corsOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; res: Response };

export async function parseBody<S extends ZodTypeAny>(
  req: Request,
  schema: S
): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: jsonError("invalid json", 400) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      res: json({ error: "validation_failed", issues: result.error.issues }, 400),
    };
  }
  return { ok: true, data: result.data };
}

export function parseQuery<S extends ZodTypeAny>(url: URL, schema: S): ParseResult<z.infer<S>> {
  const result = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!result.success) {
    return {
      ok: false,
      res: json({ error: "validation_failed", issues: result.error.issues }, 400),
    };
  }
  return { ok: true, data: result.data };
}

interface PendingUpgrade {
  incoming: IncomingMessage;
  socket: Duplex;
  head: Buffer;
  upgraded: boolean;
}

const pendingUpgrades = new WeakMap<Request, PendingUpgrade>();
const upgradeServer = new WebSocketServer({ noServer: true });

function requestFromUpgrade(incoming: IncomingMessage): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return new Request(`http://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`, {
    method: incoming.method,
    headers,
  });
}

async function rejectUpgrade(socket: Duplex, response: Response): Promise<void> {
  const body = await response.text();
  const headerLines = [...response.headers].map(([key, value]) => `${key}: ${value}`);
  socket.end(
    [
      `HTTP/1.1 ${response.status} ${response.statusText || "Error"}`,
      ...headerLines,
      `Content-Length: ${Buffer.byteLength(body)}`,
      "Connection: close",
      "",
      body,
    ].join("\r\n")
  );
}

const DEFAULT_IDLE_TIMEOUT_SECONDS = 30;

function keepAlive(ws: import("ws").WebSocket, idleTimeoutSeconds: number): void {
  let alive = true;
  ws.on("pong", () => {
    alive = true;
  });
  ws.on("message", () => {
    alive = true;
  });
  const timer = setInterval(
    () => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    },
    (idleTimeoutSeconds * 1000) / 2
  );
  ws.once("close", () => clearInterval(timer));
}

export function upgradeWebSocket(
  req: Request,
  options?: { idleTimeout?: number }
): { socket: WebSocket; response: Response } {
  const pending = pendingUpgrades.get(req);
  if (!pending) throw new TypeError("request is not a WebSocket upgrade");
  pending.upgraded = true;
  let socket: WebSocket | undefined;
  upgradeServer.handleUpgrade(pending.incoming, pending.socket, pending.head, (ws) => {
    socket = ws as unknown as WebSocket;
    keepAlive(ws, options?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_SECONDS);
    queueMicrotask(() => ws.emit("open"));
  });
  if (!socket) throw new Error("WebSocket upgrade did not complete synchronously");
  return { socket, response: new Response(null, { status: 200 }) };
}

export function serveFetch(
  options: { port: number; hostname?: string; signal?: AbortSignal },
  handler: (req: Request) => Response | Promise<Response>
): ServerType {
  const server = serve({
    port: options.port,
    hostname: options.hostname,
    fetch: (req) => trackHttpServerRequest(req, () => handler(req)),
  });
  server.on("upgrade", async (incoming: IncomingMessage, socket: Duplex, head: Buffer) => {
    const req = requestFromUpgrade(incoming);
    const pending: PendingUpgrade = { incoming, socket, head, upgraded: false };
    pendingUpgrades.set(req, pending);
    try {
      const response = await handler(req);
      if (!pending.upgraded) await rejectUpgrade(socket, response);
    } catch {
      socket.destroy();
    }
  });
  options.signal?.addEventListener("abort", () => server.close(), { once: true });
  return server;
}

// fallow-ignore-next-line unused-export
export function serveJsonService(options: {
  port: number;
  service: string;
  version: string;
  health: () => Record<string, unknown>;
  handler: (req: Request, url: URL, path: string) => Response | Promise<Response>;
  signal?: AbortSignal;
  onRequest?: () => void;
}): ServerType {
  return serveFetch({ port: options.port, signal: options.signal }, async (req) => {
    if (req.method === "OPTIONS") {
      return corsOptions();
    }

    options.onRequest?.();

    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/health" && req.method === "GET") {
      return json({
        service: options.service,
        version: options.version,
        status: "ok",
        ...options.health(),
      });
    }

    return options.handler(req, url, path);
  });
}
