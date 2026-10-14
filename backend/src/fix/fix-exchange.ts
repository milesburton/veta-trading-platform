import "@veta/bootstrap";
// FIX 4.4 Exchange — TCP listener on port 9880 (internal only)
// Accepts FIX sessions from fix-gateway, processes NewOrderSingle messages,
// and returns ExecutionReports using simulated fills from the market-sim.

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { logger } from "@veta/logger";
import { createMarketSimClient } from "@veta/market-client";
import { createProducer } from "@veta/messaging";
import { isKnownCounterparty } from "./counterparties.ts";
import { CxlRejReason, CxlRejResponseTo, ExecType, MsgType, OrdStatus, OrdType, Side, Tag } from "./fix-dictionary.ts";
import { computeFill } from "./fill-math.ts";
import { isMarketOpenForOrderEntry } from "./fix-market-session.ts";
import { utcTimestamp } from "./fix-parser.ts";
import { FixSession } from "./fix-session.ts";
import { checkRisk } from "./risk-check.ts";
import { validateVenueRouting } from "./venue-registry.ts";

const FIX_EXCHANGE_PORT = Number(Deno.env.get("FIX_EXCHANGE_PORT")) || 9_880;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const PARTICIPATION_CAP = Number(Deno.env.get("EMS_PARTICIPATION_CAP")) || 0.2;
const IMPACT_PER_1000 = Number(Deno.env.get("EMS_IMPACT_PER_1000_BPS")) || 1.0;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const RISK_ENGINE_ENABLED = Deno.env.get("RISK_ENGINE_ENABLED") !== "false";
const RISK_ENGINE_URL = `http://${Deno.env.get("RISK_ENGINE_HOST") ?? "localhost"}:${
  Deno.env.get("RISK_ENGINE_PORT") ?? "5032"
}`;

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

interface SessionRegistryEntry {
  remote: string;
  connectedAt: number;
  counterparty: string | null;
  getState: () => string;
  getOpenOrderCount: () => number;
}
const sessionRegistry = new Map<string, SessionRegistryEntry>();

const producer = await createProducer("fix-exchange").catch((err) => {
  logger.warn("Redpanda unavailable — executions will not be published to fix.execution", { err });
  return null;
});

const SOH = "\x01";

async function handleConnection(conn: Deno.TcpConn): Promise<void> {
  const remote = `${conn.remoteAddr.hostname}:${conn.remoteAddr.port}`;
  logger.info(`[FIX Exchange] Connection from ${remote}`);

  let execIdCounter = 1;
  let buffer = "";

  // Working orders for this connection, keyed by the ClOrdID the client
  // submitted them under. Cancel/replace requests reference an order by
  // its original ClOrdID (OrigClOrdID), so this is what makes those
  // requests actionable — without it, a cancel arriving mid-fill-loop had
  // nothing to look up and was silently dropped. Removed on full fill,
  // cancel, or reject.
  interface OpenOrder {
    orderId: string;
    symbol: string;
    side: "BUY" | "SELL";
    sideRaw: string;
    ordType: string;
    account: string | undefined;
    orderQty: number;
    cumQty: number;
    remainingQty: number;
    canceled: boolean;
  }
  const openOrders = new Map<string, OpenOrder>();

  const registryEntry: SessionRegistryEntry = {
    remote,
    connectedAt: Date.now(),
    counterparty: null,
    getState: () => session.sessionState,
    getOpenOrderCount: () => openOrders.size,
  };
  sessionRegistry.set(remote, registryEntry);

  const session = new FixSession({
    senderCompID: "EXCHANGE",
    // Placeholder until Logon resolves the real counterparty — every
    // connection today comes through fix-gateway's single TCP bridge, so
    // this default preserves prior behavior for a Logon that (for
    // whatever reason) never arrives.
    targetCompID: "GATEWAY",
    heartBtInt: 30,
    onSend: async (msg: string) => {
      try {
        await conn.write(new TextEncoder().encode(msg));
      } catch {
        // connection may have closed
      }
    },
    onApplicationMessage: (tags: Map<number, string>) => {
      handleApplicationMessage(tags).catch((err) => {
        logger.error("[FIX Exchange] Error processing message", { detail: err });
      });
    },
    onStateChange: (state) => {
      logger.info(`[FIX Exchange] Session state → ${state} (${remote})`);
    },
    onLogonRequest: (tags) => {
      const senderCompID = tags.get(Tag.SenderCompID);
      if (!isKnownCounterparty(senderCompID)) {
        logger.warn(`[FIX Exchange] Logon rejected: unknown SenderCompID (${remote})`, {
          senderCompID,
        });
        return false;
      }
      session.setTargetCompID(senderCompID as string);
      registryEntry.counterparty = senderCompID as string;
      return true;
    },
  });

  async function handleApplicationMessage(tags: Map<number, string>): Promise<void> {
    const msgType = tags.get(Tag.MsgType);
    if (msgType === MsgType.OrderCancelRequest) {
      handleOrderCancelRequest(tags);
      return;
    }
    if (msgType === MsgType.OrderCancelReplaceRequest) {
      handleOrderCancelReplaceRequest(tags);
      return;
    }
    if (msgType !== MsgType.NewOrderSingle) return;

    const clOrdId = tags.get(Tag.ClOrdID) ?? "";
    const symbol = tags.get(Tag.Symbol) ?? "";
    const sideRaw = tags.get(Tag.Side);
    const orderQty = Number(tags.get(Tag.OrderQty) ?? "0");
    const price = Number(tags.get(Tag.Price) ?? "0");
    const ordType = tags.get(Tag.OrdType) ?? OrdType.Limit;
    const exDestination = tags.get(Tag.ExDestination);
    // HandlInst is read and logged for visibility but not enforced: this
    // simulator only ever auto-executes, so a client requesting manual
    // handling (HandlInst=2) gets the same auto-executed behavior as
    // automated handling (HandlInst=1) — no separate manual-handling path
    // exists to route to.
    const handlInst = tags.get(Tag.HandlInst);
    const account = tags.get(Tag.Account);

    const side: "BUY" | "SELL" = sideRaw === Side.Sell ? "SELL" : "BUY";
    const orderId = `EX-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    logger.info(
      `[FIX Exchange] NOS: clOrdId=${clOrdId} symbol=${symbol} side=${side} qty=${orderQty} ` +
        `price=${price} exDestination=${exDestination ?? "-"} handlInst=${handlInst ?? "-"} account=${account ?? "-"}`
    );

    function sendReject(reason: string): void {
      logger.info(`[FIX Exchange] Rejected: clOrdId=${clOrdId} reason=${reason}`);
      session.sendMessage([
        [Tag.MsgType, MsgType.ExecutionReport],
        [Tag.OrderID, orderId],
        [Tag.ClOrdID, clOrdId],
        [Tag.ExecID, `${execIdCounter++}`],
        [Tag.ExecType, ExecType.Rejected],
        [Tag.OrdStatus, OrdStatus.Rejected],
        [Tag.Symbol, symbol],
        [Tag.Side, sideRaw ?? Side.Buy],
        [Tag.OrdType, ordType],
        [Tag.LeavesQty, 0],
        [Tag.CumQty, 0],
        [Tag.AvgPx, 0],
        [Tag.Text, reason],
        [Tag.TransactTime, utcTimestamp()],
      ]);
    }

    const venueCheck = validateVenueRouting(exDestination, ordType === OrdType.Market, orderQty);
    if (!venueCheck.ok) {
      sendReject(venueCheck.reason ?? "Venue routing rejected");
      return;
    }

    // Session-hours gate (ADR 0003 Phase 6). sessionPhase is broadcast by
    // market-sim on the same tick stream this file already connects to, so
    // no new connection or Kafka consumer is needed. This closes only the
    // session-hours gap on the FIX side — it does not route the order
    // through risk-engine or OMS (see fix-protocol docs' known gaps).
    const sessionPhase = marketClient.getLatest().sessionPhase;
    if (!isMarketOpenForOrderEntry(sessionPhase)) {
      sendReject(`Market ${sessionPhase}`);
      return;
    }

    // Pre-trade risk check (FIX remediation plan Phase 3, Option B — see
    // ADR 0004). Calls risk-engine's existing POST /check directly rather
    // than routing through orders.new/OMS; that fuller integration is a
    // separately-scoped, larger change. SenderCompID stands in for userId
    // since FIX sessions authenticate as a counterparty, not an
    // individual platform user — Account (if sent) identifies a
    // sub-account within that counterparty but isn't itself a risk
    // identity today.
    if (RISK_ENGINE_ENABLED) {
      const referencePrice = price > 0 ? price : (marketClient.getLatest().prices[symbol] ?? 0);
      const senderCompID = tags.get(Tag.SenderCompID) ?? "UNKNOWN";
      const riskResult = await checkRisk(RISK_ENGINE_URL, {
        orderId: clOrdId,
        userId: senderCompID,
        userRole: "trader",
        symbol,
        side,
        quantity: orderQty,
        limitPrice: referencePrice,
      });
      if (!riskResult.allowed) {
        sendReject(`Risk check failed: ${riskResult.reasons.join("; ")}`);
        return;
      }
      for (const w of riskResult.warnings) {
        logger.info(`[FIX Exchange] Risk warning for ${clOrdId}: ${w}`);
      }
    }

    // ExecReport: New (acknowledge receipt)
    const ackExecId = `${execIdCounter++}`;
    session.sendMessage([
      [Tag.MsgType, MsgType.ExecutionReport],
      [Tag.OrderID, orderId],
      [Tag.ClOrdID, clOrdId],
      [Tag.ExecID, ackExecId],
      [Tag.ExecType, ExecType.New],
      [Tag.OrdStatus, OrdStatus.New],
      [Tag.Symbol, symbol],
      [Tag.Side, sideRaw ?? Side.Buy],
      [Tag.OrdType, ordType],
      [Tag.LeavesQty, orderQty],
      [Tag.CumQty, 0],
      [Tag.AvgPx, 0],
      ...(account ? ([[Tag.Account, account]] as [number, string][]) : []),
      [Tag.TransactTime, utcTimestamp()],
    ]);

    const openOrder: OpenOrder = {
      orderId,
      symbol,
      side,
      sideRaw: sideRaw ?? Side.Buy,
      ordType,
      account,
      orderQty,
      cumQty: 0,
      remainingQty: orderQty,
      canceled: false,
    };
    openOrders.set(clOrdId, openOrder);

    // Simulated exchange latency: 10–50ms
    const latencyMs = 10 + Math.floor(Math.random() * 40);
    await new Promise((r) => setTimeout(r, latencyMs));

    // A cancel may have arrived while we were "at the exchange" above —
    // check before touching the market at all.
    if (openOrder.canceled) return;

    // Determine fill using market data
    const tick = marketClient.getLatest();
    const midPrice = tick.prices[symbol] ?? price;
    const tickVolume = tick.volumes[symbol] ?? 1_000;

    let cumQty = 0;
    let remainingQty = orderQty;

    // Fill in up to 3 partial slices to simulate realistic execution
    let sliceNum = 0;
    while (remainingQty > 0 && sliceNum < 3) {
      if (openOrder.canceled) return;
      sliceNum++;

      const fill = computeFill(
        remainingQty,
        side,
        midPrice,
        tickVolume,
        PARTICIPATION_CAP,
        IMPACT_PER_1000
      );

      if (fill.filledQty === 0) break; // no more liquidity

      cumQty += fill.filledQty;
      remainingQty = fill.remainingQty;
      openOrder.cumQty = cumQty;
      openOrder.remainingQty = remainingQty;

      const isFinal = remainingQty === 0;
      const execType = isFinal ? ExecType.Fill : ExecType.PartialFill;
      const ordStatus = isFinal ? OrdStatus.Filled : OrdStatus.PartiallyFilled;

      const fillExecId = `${execIdCounter++}`;
      const transactTime = utcTimestamp();
      session.sendMessage([
        [Tag.MsgType, MsgType.ExecutionReport],
        [Tag.OrderID, orderId],
        [Tag.ClOrdID, clOrdId],
        [Tag.ExecID, fillExecId],
        [Tag.ExecType, execType],
        [Tag.OrdStatus, ordStatus],
        [Tag.Symbol, symbol],
        [Tag.Side, sideRaw ?? Side.Buy],
        [Tag.OrdType, ordType],
        [Tag.LastQty, fill.filledQty],
        [Tag.LastPx, fill.avgFillPrice],
        [Tag.LeavesQty, remainingQty],
        [Tag.CumQty, cumQty],
        [Tag.AvgPx, fill.avgFillPrice],
        ...(account ? ([[Tag.Account, account]] as [number, string][]) : []),
        [Tag.TransactTime, transactTime],
      ]);

      // execType/ordStatus "2" (not the dictionary's ExecType.Fill="F") to
      // match the value the other fix.execution producers (ems-server.ts,
      // rfq-service.ts, dark-pool-server.ts) already send for a full fill —
      // fix-archive stores whatever arrives untyped, so consistency across
      // producers matters more than matching this file's own wire-facing
      // ExecType constant.
      await producer
        ?.send("fix.execution", {
          execId: fillExecId,
          clOrdId,
          origClOrdId: orderId,
          symbol,
          side: sideRaw ?? Side.Buy,
          execType: isFinal ? "2" : "1",
          ordStatus: isFinal ? "2" : "1",
          leavesQty: remainingQty,
          cumQty,
          avgPx: fill.avgFillPrice,
          lastQty: fill.filledQty,
          lastPx: fill.avgFillPrice,
          venue: "FIX-EXCHANGE",
          account,
          transactTime,
          ts: Date.now(),
        })
        .catch(() => {});

      logger.info(
        `[FIX Exchange] Fill: clOrdId=${clOrdId} ${fill.filledQty}/${orderQty} @ ${fill.avgFillPrice}` +
          ` leaves=${remainingQty} impact=${fill.marketImpactBps.toFixed(2)}bps`
      );

      if (isFinal) {
        openOrders.delete(clOrdId);
      } else {
        // Small gap between partial fills
        await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 100)));
      }
    }
  }

  function findOpenOrder(origClOrdId: string): OpenOrder | undefined {
    return openOrders.get(origClOrdId);
  }

  function handleOrderCancelRequest(tags: Map<number, string>): void {
    const cancelClOrdId = tags.get(Tag.ClOrdID) ?? "";
    const origClOrdId = tags.get(Tag.OrigClOrdID) ?? "";
    const symbol = tags.get(Tag.Symbol) ?? "";
    const sideRaw = tags.get(Tag.Side);

    const order = findOpenOrder(origClOrdId);
    if (!order || order.canceled) {
      logger.info(
        `[FIX Exchange] OrderCancelReject: origClOrdId=${origClOrdId} reason=unknown-or-already-final`
      );
      session.sendMessage([
        [Tag.MsgType, MsgType.OrderCancelReject],
        [Tag.OrderID, order?.orderId ?? "NONE"],
        [Tag.ClOrdID, cancelClOrdId],
        [Tag.OrigClOrdID, origClOrdId],
        [Tag.OrdStatus, OrdStatus.Rejected],
        [Tag.CxlRejResponseTo, CxlRejResponseTo.OrderCancelRequest],
        [Tag.CxlRejReason, CxlRejReason.UnknownOrder],
        [Tag.Text, "Unknown or already-final order"],
        [Tag.TransactTime, utcTimestamp()],
      ]);
      return;
    }

    order.canceled = true;
    openOrders.delete(origClOrdId);

    logger.info(`[FIX Exchange] Canceled: origClOrdId=${origClOrdId} leaves=${order.remainingQty}`);
    session.sendMessage([
      [Tag.MsgType, MsgType.ExecutionReport],
      [Tag.OrderID, order.orderId],
      [Tag.ClOrdID, cancelClOrdId],
      [Tag.OrigClOrdID, origClOrdId],
      [Tag.ExecID, `${execIdCounter++}`],
      [Tag.ExecType, ExecType.Canceled],
      [Tag.OrdStatus, OrdStatus.Canceled],
      [Tag.Symbol, symbol || order.symbol],
      [Tag.Side, sideRaw ?? order.sideRaw],
      [Tag.OrdType, order.ordType],
      [Tag.LeavesQty, 0],
      [Tag.CumQty, order.cumQty],
      [Tag.AvgPx, 0],
      ...(order.account ? ([[Tag.Account, order.account]] as [number, string][]) : []),
      [Tag.TransactTime, utcTimestamp()],
    ]);
  }

  function handleOrderCancelReplaceRequest(tags: Map<number, string>): void {
    const replaceClOrdId = tags.get(Tag.ClOrdID) ?? "";
    const origClOrdId = tags.get(Tag.OrigClOrdID) ?? "";
    const symbol = tags.get(Tag.Symbol) ?? "";
    const sideRaw = tags.get(Tag.Side);
    const newOrderQty = Number(tags.get(Tag.OrderQty) ?? "0");

    const order = findOpenOrder(origClOrdId);
    if (!order || order.canceled) {
      logger.info(
        `[FIX Exchange] OrderCancelReject (replace): origClOrdId=${origClOrdId} reason=unknown-or-already-final`
      );
      session.sendMessage([
        [Tag.MsgType, MsgType.OrderCancelReject],
        [Tag.OrderID, order?.orderId ?? "NONE"],
        [Tag.ClOrdID, replaceClOrdId],
        [Tag.OrigClOrdID, origClOrdId],
        [Tag.OrdStatus, OrdStatus.Rejected],
        [Tag.CxlRejResponseTo, CxlRejResponseTo.OrderCancelReplaceRequest],
        [Tag.CxlRejReason, CxlRejReason.UnknownOrder],
        [Tag.Text, "Unknown or already-final order"],
        [Tag.TransactTime, utcTimestamp()],
      ]);
      return;
    }

    if (newOrderQty > 0 && newOrderQty < order.cumQty) {
      logger.info(
        `[FIX Exchange] OrderCancelReject (replace): origClOrdId=${origClOrdId} reason=qty-below-filled`
      );
      session.sendMessage([
        [Tag.MsgType, MsgType.OrderCancelReject],
        [Tag.OrderID, order.orderId],
        [Tag.ClOrdID, replaceClOrdId],
        [Tag.OrigClOrdID, origClOrdId],
        [Tag.OrdStatus, OrdStatus.PartiallyFilled],
        [Tag.CxlRejResponseTo, CxlRejResponseTo.OrderCancelReplaceRequest],
        [Tag.CxlRejReason, CxlRejReason.Other],
        [Tag.Text, `New OrderQty ${newOrderQty} is below already-filled quantity ${order.cumQty}`],
        [Tag.TransactTime, utcTimestamp()],
      ]);
      return;
    }

    // Re-key under the replacement ClOrdID, per FIX convention — a
    // subsequent cancel/replace on this order references the new ID, not
    // the original one.
    openOrders.delete(origClOrdId);
    if (newOrderQty > 0) {
      order.orderQty = newOrderQty;
      order.remainingQty = newOrderQty - order.cumQty;
    }
    openOrders.set(replaceClOrdId, order);

    logger.info(
      `[FIX Exchange] Replaced: origClOrdId=${origClOrdId} -> ${replaceClOrdId} newQty=${order.orderQty} leaves=${order.remainingQty}`
    );
    session.sendMessage([
      [Tag.MsgType, MsgType.ExecutionReport],
      [Tag.OrderID, order.orderId],
      [Tag.ClOrdID, replaceClOrdId],
      [Tag.OrigClOrdID, origClOrdId],
      [Tag.ExecID, `${execIdCounter++}`],
      [Tag.ExecType, ExecType.New],
      [Tag.OrdStatus, order.cumQty > 0 ? OrdStatus.PartiallyFilled : OrdStatus.New],
      [Tag.Symbol, symbol || order.symbol],
      [Tag.Side, sideRaw ?? order.sideRaw],
      [Tag.OrdType, order.ordType],
      [Tag.LeavesQty, order.remainingQty],
      [Tag.CumQty, order.cumQty],
      [Tag.AvgPx, 0],
      ...(order.account ? ([[Tag.Account, order.account]] as [number, string][]) : []),
      [Tag.TransactTime, utcTimestamp()],
    ]);
  }

  // Read loop — reassemble SOH-delimited FIX messages from the TCP stream
  const readBuf = new Uint8Array(4096);
  try {
    while (true) {
      const bytesRead = await conn.read(readBuf);
      if (bytesRead === null) break; // EOF

      buffer += new TextDecoder().decode(readBuf.subarray(0, bytesRead));

      // A FIX message ends with 10=<checksum><SOH>
      // Split on the checksum trailer pattern so we handle multiple messages per read
      while (true) {
        const msgEnd = buffer.indexOf(`${SOH}10=`);
        if (msgEnd === -1) break;
        // Find the SOH after the checksum value (3 digits + SOH)
        const trailerEnd = msgEnd + 7; // \x0110=XXX\x01 = 7 chars
        if (trailerEnd > buffer.length) break; // incomplete

        const raw = buffer.slice(0, trailerEnd);
        buffer = buffer.slice(trailerEnd);
        session.handleInbound(raw);
      }
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.BadResource)) {
      logger.error(`[FIX Exchange] Read error (${remote})`, { detail: err });
    }
  } finally {
    session.disconnect();
    sessionRegistry.delete(remote);
    try {
      conn.close();
    } catch {
      /* already closed */
    }
    logger.info(`[FIX Exchange] Connection closed (${remote})`);
  }
}

// The exchange exposes a plain HTTP GET /health on port 9880 + 1 = 9879
// (keep TCP clean; health check on a separate port)

const HEALTH_PORT = FIX_EXCHANGE_PORT - 1; // 9879

Deno.serve({ port: HEALTH_PORT }, (req) => {
  const { pathname } = new URL(req.url);

  if (pathname === "/health") {
    return new Response(
      JSON.stringify({
        service: "fix-exchange",
        version: VERSION,
        status: "ok",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (pathname === "/sessions") {
    const sessions = Array.from(sessionRegistry.values()).map((entry) => ({
      remote: entry.remote,
      counterparty: entry.counterparty,
      state: entry.getState(),
      connectedAt: entry.connectedAt,
      openOrders: entry.getOpenOrderCount(),
    }));
    return new Response(JSON.stringify({ sessions }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not found", { status: 404 });
});

const listener = Deno.listen({ port: FIX_EXCHANGE_PORT });
logger.info(`[FIX Exchange] Listening on TCP port ${FIX_EXCHANGE_PORT} (health: ${HEALTH_PORT})`);
logger.info(`[FIX Exchange] version=${VERSION}`);

for await (const conn of listener) {
  handleConnection(conn as Deno.TcpConn).catch((err) => {
    logger.error("[FIX Exchange] Unhandled connection error", { detail: err });
  });
}
