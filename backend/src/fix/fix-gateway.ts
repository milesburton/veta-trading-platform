import "#veta/bootstrap";
import type { Socket } from "node:net";
// FIX Gateway — HTTP/WebSocket server on port 9881
// Bridges browser WebSocket connections to the FIX Exchange TCP listener (port 9880).
// Each WS client gets a dedicated TCP connection to the exchange.
//
// Routes:
//   GET /ws/fix   → WebSocket upgrade → proxy to fixExchange TCP
//   GET /health   → JSON health check
import { serveFetch, upgradeWebSocket } from "#veta/http";
import { logger } from "#veta/logger";
import { connectTcp } from "../lib/tcp.ts";

const FIX_GATEWAY_PORT = Number(process.env.FIX_GATEWAY_PORT) || 9_881;
const FIX_EXCHANGE_HOST = process.env.FIX_EXCHANGE_HOST || "localhost";
const FIX_EXCHANGE_PORT = Number(process.env.FIX_EXCHANGE_PORT) || 9_880;
const VERSION = process.env.COMMIT_SHA || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function bridgeConnection(ws: WebSocket): Promise<void> {
  let tcpConn: Socket | null = null;
  let closed = false;

  function closeBoth(): void {
    if (closed) return;
    closed = true;
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    tcpConn?.destroy();
  }

  try {
    tcpConn = await connectTcp(FIX_EXCHANGE_HOST, FIX_EXCHANGE_PORT);
  } catch (err) {
    logger.error(
      `[FIX Gateway] Cannot connect to exchange at ${FIX_EXCHANGE_HOST}:${FIX_EXCHANGE_PORT}`,
      { detail: err }
    );
    ws.close(1011, "Exchange unavailable");
    return;
  }

  logger.info(`[FIX Gateway] Bridging WS client to ${FIX_EXCHANGE_HOST}:${FIX_EXCHANGE_PORT}`);

  ws.onmessage = (event) => {
    if (closed || !tcpConn) return;
    const data =
      typeof event.data === "string"
        ? Buffer.from(event.data)
        : Buffer.from(event.data as ArrayBuffer);
    tcpConn.write(data, (err) => {
      if (err) {
        logger.error("[FIX Gateway] WS→TCP write error", { detail: err });
        closeBoth();
      }
    });
  };

  ws.onclose = () => {
    logger.info(`[FIX Gateway] WS client disconnected`);
    closeBoth();
  };

  ws.onerror = (err) => {
    logger.error("[FIX Gateway] WS error", { detail: err });
    closeBoth();
  };

  tcpConn.on("data", (chunk: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk.toString());
    }
  });
  tcpConn.on("error", (err) => {
    if (!closed) logger.error("[FIX Gateway] TCP→WS read error", { detail: err });
    closeBoth();
  });
  tcpConn.on("close", closeBoth);
}

serveFetch({ port: FIX_GATEWAY_PORT }, (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({
        service: "fix-gateway",
        version: VERSION,
        status: "ok",
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  // WebSocket upgrade for /ws/fix or root path (Traefik strips prefix)
  if (
    req.method === "GET" &&
    (url.pathname === "/ws/fix" || url.pathname === "/") &&
    req.headers.get("upgrade")?.toLowerCase() === "websocket"
  ) {
    const { socket, response } = upgradeWebSocket(req);
    bridgeConnection(socket).catch((err) => {
      logger.error("[FIX Gateway] Bridge error", { detail: err });
    });
    return response;
  }

  return new Response("Not found", { status: 404, headers: CORS_HEADERS });
});

logger.info(`[FIX Gateway] Listening on port ${FIX_GATEWAY_PORT}`);
logger.info(`[FIX Gateway] Bridging to exchange at ${FIX_EXCHANGE_HOST}:${FIX_EXCHANGE_PORT}`);
logger.info(`[FIX Gateway] version=${VERSION}`);
