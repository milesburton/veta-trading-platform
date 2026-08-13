import "@veta/bootstrap";
import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { logger } from "@veta/logger";
import { isDeskOpen } from "./deskCalendar.ts";
import { DecisionEngine } from "./decisionEngine.ts";
import { GatewaySocket } from "./gatewaySocket.ts";
import { nextDelayMs } from "./pacing.ts";
import { PositionTracker } from "./positionTracker.ts";
import { TokenClient } from "./tokenClient.ts";

const PORT = Number(Deno.env.get("SYNTHETIC_TRADER_PORT")) || 5_031;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const GATEWAY_WS_URL = Deno.env.get("GATEWAY_WS_URL") ?? "ws://gateway:5011/ws/gateway";
const USER_SERVICE_URL = Deno.env.get("USER_SERVICE_URL") ?? "http://user-service:5008";
const MARKET_SIM_URL = `http://${Deno.env.get("MARKET_SIM_HOST") ?? "market-sim"}:${
  Deno.env.get("MARKET_SIM_PORT") ?? "5000"
}`;

const OAUTH_CLIENT_ID = Deno.env.get("OAUTH_CLIENT_ID") ?? "veta-automation";
const USER_ID = Deno.env.get("SYNTHETIC_TRADER_USER_ID") ?? "synthetic-trader-1";
const PASSWORD = Deno.env.get("SYNTHETIC_TRADER_PASSWORD") ?? "";
const ARCHETYPE_ID = Deno.env.get("SYNTHETIC_TRADER_ARCHETYPE") ?? "equity-high-touch";
const ENABLED = Deno.env.get("SYNTHETIC_TRADER_ENABLED") === "true";
const DRY_RUN = Deno.env.get("SYNTHETIC_TRADER_DRY_RUN") !== "false";
const MIN_PACE_MS = Number(Deno.env.get("SYNTHETIC_TRADER_MIN_PACE_MS")) || 30_000;
const MAX_PACE_MS = Number(Deno.env.get("SYNTHETIC_TRADER_MAX_PACE_MS")) || 480_000;
const SYMBOLS = Deno.env.get("SYNTHETIC_TRADER_SYMBOLS")?.split(",").map((s) => s.trim());
const MAX_DAILY_NOTIONAL_FRACTION = 0.5;

if (!PASSWORD) {
  logger.error("synthetic-trader: SYNTHETIC_TRADER_PASSWORD is required, exiting");
  Deno.exit(1);
}

const tracker = new PositionTracker();
const engine = new DecisionEngine({ archetypeId: ARCHETYPE_ID, userId: USER_ID, symbols: SYMBOLS });

let latestPrices: Record<string, number> = {};
let dailyNotional = 0;
let dailyNotionalDate = new Date().toISOString().slice(0, 10);

let submitted = 0;
let filled = 0;
let rejected = 0;

async function refreshPrices(): Promise<void> {
  try {
    const res = await fetch(`${MARKET_SIM_URL}/prices`);
    if (res.ok) {
      latestPrices = (await res.json()) as Record<string, number>;
    }
  } catch (err) {
    logger.warn("synthetic-trader: failed to refresh prices", { err });
  }
}
setInterval(refreshPrices, 15_000);
refreshPrices();

const socket = new GatewaySocket(GATEWAY_WS_URL, {
  onAuthIdentity: (identity) => {
    logger.info(`synthetic-trader: authenticated as ${identity.user.id} (${identity.user.role})`);
  },
  onAuthError: (reason) => {
    logger.error(`synthetic-trader: auth error: ${reason}`);
  },
  onOrderAck: (ack) => {
    submitted += 1;
    tracker.recordAck({
      clientOrderId: ack.clientOrderId,
      asset: ack.asset,
      side: ack.side,
      quantity: ack.quantity,
      limitPrice: ack.limitPrice,
    });
    logger.info(`synthetic-trader: order acked ${ack.side} ${ack.quantity} ${ack.asset}`, {
      clientOrderId: ack.clientOrderId,
      strategy: ack.strategy,
    });
  },
  onOrderRejected: (rejection) => {
    rejected += 1;
    tracker.recordTerminal(rejection.clientOrderId);
    logger.warn(`synthetic-trader: order rejected: ${rejection.reason}`, {
      clientOrderId: rejection.clientOrderId,
    });
  },
  onOrderEvent: (event) => {
    const data = event.data;
    const clientOrderId = data.clientOrderId as string | undefined;
    if (event.topic === "orders.filled") {
      filled += 1;
      const remainingQty = data.remainingQty as number | undefined;
      if (remainingQty === undefined || remainingQty <= 0) {
        tracker.recordTerminal(clientOrderId);
      }
    } else if (event.topic === "orders.cancelled" || event.topic === "orders.expired") {
      tracker.recordTerminal(clientOrderId);
    }
  },
});

const tokenClient = new TokenClient({
  userServiceUrl: USER_SERVICE_URL,
  clientId: OAUTH_CLIENT_ID,
  username: USER_ID,
  password: PASSWORD,
});

function scheduleNextTick(): void {
  setTimeout(tick, nextDelayMs(MIN_PACE_MS, MAX_PACE_MS));
}

function resetDailyNotionalIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyNotionalDate) {
    dailyNotionalDate = today;
    dailyNotional = 0;
  }
}

function tick(): void {
  scheduleNextTick();
  if (!ENABLED) return;
  if (!socket.isReady) {
    logger.info("synthetic-trader: tick skipped, socket not ready");
    return;
  }
  resetDailyNotionalIfNewDay();

  const decision = engine.decide(tracker, (symbol) => latestPrices[symbol]);
  if (decision.kind === "skip") {
    logger.info(`synthetic-trader: tick skipped, ${decision.skippedReason}`);
    return;
  }

  const order = decision.order;
  if (!isDeskOpen(order.desk, new Date())) {
    logger.info("synthetic-trader: tick skipped, outside market hours", { desk: order.desk });
    return;
  }
  const notional = order.quantity * (order.limitPrice ?? 0);
  const dailyCap = 1_000_000 * MAX_DAILY_NOTIONAL_FRACTION;
  if (dailyNotional + notional > dailyCap) {
    logger.info("synthetic-trader: tick skipped, self-imposed daily notional cap reached");
    return;
  }

  if (DRY_RUN) {
    logger.info("synthetic-trader: dry-run, would submit order", { order });
    return;
  }

  dailyNotional += notional;
  socket.submitOrder(order);
}

logger.info("synthetic-trader: booting", {
  archetype: ARCHETYPE_ID,
  userId: USER_ID,
  enabled: ENABLED,
  dryRun: DRY_RUN,
  minPaceMs: MIN_PACE_MS,
  maxPaceMs: MAX_PACE_MS,
  symbols: SYMBOLS,
});

socket.connect();
tokenClient.start((token) => socket.authenticate(token));
scheduleNextTick();

setInterval(() => {
  logger.info("synthetic-trader: hourly summary", {
    submitted,
    filled,
    rejected,
    openOrders: tracker.openOrderCount(),
    dailyNotional,
  });
}, 60 * 60_000);

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/health") {
    return new Response(
      JSON.stringify({ service: "synthetic-trader", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
  return new Response("Not found", { status: 404 });
});
