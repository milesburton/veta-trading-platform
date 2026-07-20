/**
 * Gateway middleware
 *
 * The GUI's single connection to the backend. Replaces:
 *   - marketFeedMiddleware (direct market-sim WebSocket)
 *   - fixMiddleware (direct FIX gateway WebSocket)
 *   - direct HTTP calls to algo/ems/journal services
 *
 * One WebSocket to the gateway service; the gateway fans out all events.
 *
 * Inbound (gateway → GUI) event types:
 *   marketUpdate   → market tick data (prices, volumes, orderBook)
 *   orderEvent     → order lifecycle (submitted, routed, child, filled, expired, rejected)
 *   algoHeartbeat  → algo engine status
 *   orderAck       → gateway confirmed order was published to bus
 *   error          → gateway-level error
 *
 * Outbound (GUI → gateway):
 *   { type: "submitOrder", payload: Trade }
 */

import type { Middleware, UnknownAction } from "@reduxjs/toolkit";
import { advisoryNoteReceived } from "@veta/frontend/store/advisorySlice.ts";
import { alertAdded } from "@veta/frontend/store/alertsSlice.ts";
import type { AuthUser, TradingLimits } from "@veta/frontend/store/authSlice.ts";
import { sessionExpired, setUser, setUserWithLimits } from "@veta/frontend/store/authSlice.ts";
import { breakerExpired, breakerFired } from "@veta/frontend/store/breakersSlice.ts";
import { feedReceived } from "@veta/frontend/store/feedSlice.ts";
import { gridApi } from "@veta/frontend/store/gridApi.ts";
import { loadGridPrefs } from "@veta/frontend/store/gridPrefsSlice.ts";
import {
  type FeatureVector,
  featureReceived,
  recommendationReceived,
  type Signal,
  signalReceived,
  type TradeRecommendation,
} from "@veta/frontend/store/intelligenceSlice.ts";
import type { KillBlock } from "@veta/frontend/store/killSwitchSlice.ts";
import { allBlocksCleared, blockAdded } from "@veta/frontend/store/killSwitchSlice.ts";
import {
  type LlmSubsystemStatus,
  llmStateReceived,
} from "@veta/frontend/store/llmSubsystemSlice.ts";
import {
  candlesSeeded,
  connectionFailed,
  connectionRecovered,
  type MarketPhase,
  marketSlice,
  orderBookUpdated,
  setSessionPhase,
} from "@veta/frontend/store/marketSlice.ts";
import { newsApi } from "@veta/frontend/store/newsApi.ts";
import type { NewsItem } from "@veta/frontend/store/newsSlice.ts";
import { newsBatchReceived, newsItemReceived } from "@veta/frontend/store/newsSlice.ts";
import { reportError } from "@veta/frontend/store/observabilitySlice.ts";
import {
  childAdded,
  fillReceived,
  orderCancelled,
  orderPatched,
  setGatewayWs,
} from "@veta/frontend/store/ordersSlice.ts";
import { isSafeKey } from "@veta/frontend/store/safeKey.ts";
import { loadUiPrefs, setSelectedAsset, setUpgradeStatus } from "@veta/frontend/store/uiSlice.ts";
import type { AssetDef, OhlcCandle, OrderBookSnapshot, OrderSide } from "@veta/frontend/types.ts";
import { z } from "zod";

const _origin = typeof window !== "undefined" ? globalThis.location.origin : "";
const _wsOrigin = _origin.replace(/^http/, "ws");

const GATEWAY_WS_URL = import.meta.env.VITE_GATEWAY_WS_URL ?? `${_wsOrigin}/ws/gateway`;
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? `${_origin}/api/gateway`;

const UI_TICK_INTERVAL_MS = 250;
const ALGO_HEARTBEAT_TIMEOUT_MS = 30_000;
const RECONNECT_DELAY_INITIAL_MS = 2_000;
const RECONNECT_DELAY_MAX_MS = 15_000;
const RECONNECT_DELAY_AFTER_GIVE_UP_MS = 20_000;
const SHOW_BANNER_AFTER_FAILURES = 3;

const OrderRejectedSchema = z.object({
  reason: z
    .string()
    .min(1)
    .max(500)
    .regex(/^[\x20-\x7e]+$/)
    .optional(),
  clientOrderId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[\w.:-]+$/)
    .optional(),
});

const ServerErrorSchema = z.object({
  message: z
    .string()
    .min(1)
    .max(500)
    .regex(/^[\x20-\x7e]+$/)
    .optional(),
});

interface MarketUpdateData {
  prices: Record<string, number>;
  openPrices?: Record<string, number>;
  volumes: Record<string, number>;
  orderBook?: Record<string, OrderBookSnapshot>;
  sessionPhase?: string;
}

interface OrderEventData {
  childId?: string;
  parentOrderId?: string;
  clientOrderId?: string;
  filledQty?: number;
  remainingQty?: number;
  avgFillPrice?: number;
  marketImpactBps?: number;
  venue?: string;
  venueName?: string;
  counterparty?: string;
  liquidityFlag?: "MAKER" | "TAKER" | "CROSS";
  commissionUSD?: number;
  secFeeUSD?: number;
  finraTafUSD?: number;
  totalFeeUSD?: number;
  settlementDate?: string;
  orderId?: string;
  asset?: string;
  side?: OrderSide;
  quantity?: number;
  limitPrice?: number;
  expiresAt?: number;
  strategy?: string;
  algoParams?: Record<string, unknown>;
  status?: string;
  algo?: string;
  ts?: number;
}

export const gatewayMiddleware: Middleware = (storeAPI) => {
  let ws: WebSocket | null = null;
  let reconnectDelay = RECONNECT_DELAY_INITIAL_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveFailures = 0;
  let started = false;
  let visibilityListenerInstalled = false;
  let breakerJanitorTimer: ReturnType<typeof setInterval> | null = null;

  const algoLastSeen: Record<string, number> = {};

  let pendingPrices: Record<string, number> = {};
  let pendingOpenPrices: Record<string, number> = {};
  let pendingVolumes: Record<string, number> = {};
  let pendingOrderBook: Record<string, OrderBookSnapshot> | null = null;
  let hasPendingTick = false;
  let tickTimer: ReturnType<typeof setTimeout> | null = null;

  function flushTick() {
    tickTimer = null;
    if (!hasPendingTick) return;
    const knownPrices =
      (storeAPI.getState() as { market?: { prices?: Record<string, number> } }).market?.prices ??
      {};
    for (const sym of [
      ...Object.keys(pendingVolumes),
      ...Object.keys(pendingOpenPrices),
      ...Object.keys(pendingOrderBook ?? {}),
    ]) {
      if (pendingPrices[sym] === undefined && knownPrices[sym] !== undefined) {
        pendingPrices[sym] = knownPrices[sym];
      }
    }
    storeAPI.dispatch(
      marketSlice.actions.tickReceived({
        prices: pendingPrices,
        openPrices: Object.keys(pendingOpenPrices).length > 0 ? pendingOpenPrices : undefined,
        volumes: pendingVolumes,
        ts: Date.now(),
      })
    );
    if (pendingOrderBook) storeAPI.dispatch(orderBookUpdated(pendingOrderBook));
    pendingPrices = {};
    pendingOpenPrices = {};
    pendingVolumes = {};
    pendingOrderBook = null;
    hasPendingTick = false;
  }

  function handleMarketUpdate(data: MarketUpdateData) {
    hasPendingTick = true;
    if (data.prices) pendingPrices = { ...pendingPrices, ...data.prices };
    if (data.openPrices) pendingOpenPrices = { ...pendingOpenPrices, ...data.openPrices };
    for (const [sym, vol] of Object.entries(data.volumes ?? {})) {
      if (!isSafeKey(sym)) continue;
      pendingVolumes[sym] = (pendingVolumes[sym] ?? 0) + vol;
    }
    if (data.orderBook) {
      pendingOrderBook = { ...pendingOrderBook, ...data.orderBook };
    }
    if (data.sessionPhase) {
      storeAPI.dispatch(setSessionPhase(data.sessionPhase as MarketPhase));
    }
    if (!tickTimer) tickTimer = setTimeout(flushTick, UI_TICK_INTERVAL_MS);
  }

  function patchOrderStatus(data: OrderEventData, status: "pending" | "working" | "expired") {
    if (!data.orderId) return;
    storeAPI.dispatch(orderPatched({ id: data.clientOrderId ?? data.orderId, patch: { status } }));
  }

  function dispatchChildAddedFromEvent(
    data: OrderEventData,
    opts: {
      quantity: number;
      limitPrice: number;
      status: "working" | "filled";
      filled: number;
      enrichedWithFill?: boolean;
    }
  ) {
    if (!data.parentOrderId || !data.childId) return;
    const parentId = data.clientOrderId ?? data.parentOrderId;
    storeAPI.dispatch(
      childAdded({
        parentId,
        child: {
          id: data.childId,
          parentId,
          asset: data.asset ?? "",
          side: data.side ?? "BUY",
          quantity: opts.quantity,
          limitPrice: opts.limitPrice,
          status: opts.status,
          filled: opts.filled,
          submittedAt: data.ts ?? Date.now(),
          ...(opts.enrichedWithFill
            ? {
                avgFillPrice: data.avgFillPrice,
                commissionUSD: data.commissionUSD,
                venue: data.venue as import("../../types.ts").VenueMIC | undefined,
                counterparty: data.counterparty,
                liquidityFlag: data.liquidityFlag,
                settlementDate: data.settlementDate,
              }
            : {}),
        },
      })
    );
  }

  function onOrderSubmittedOrNew(data: OrderEventData) {
    patchOrderStatus(data, "pending");
  }

  function onOrderRouted(data: OrderEventData) {
    patchOrderStatus(data, "working");
  }

  function onOrderChild(data: OrderEventData) {
    dispatchChildAddedFromEvent(data, {
      quantity: data.quantity ?? 0,
      limitPrice: data.limitPrice ?? 0,
      status: "working",
      filled: 0,
    });
  }

  function onOrderFilled(data: OrderEventData) {
    if (!data.parentOrderId || data.filledQty == null) return;
    storeAPI.dispatch(
      fillReceived({
        clOrdId: data.clientOrderId ?? data.parentOrderId,
        filledQty: data.filledQty,
        avgFillPrice: data.avgFillPrice ?? 0,
        leavesQty: data.remainingQty ?? 0,
      })
    );
    dispatchChildAddedFromEvent(data, {
      quantity: data.filledQty,
      limitPrice: data.avgFillPrice ?? 0,
      status: "filled",
      filled: data.filledQty,
      enrichedWithFill: true,
    });
  }

  function onOrderExpired(data: OrderEventData) {
    patchOrderStatus(data, "expired");
  }

  function onOrderRejectedTopic(data: OrderEventData) {
    if (!data.clientOrderId) return;
    storeAPI.dispatch(orderPatched({ id: data.clientOrderId, patch: { status: "rejected" } }));
  }

  function onOrderCancelled(data: OrderEventData) {
    if (!data.clientOrderId) return;
    storeAPI.dispatch(orderCancelled({ clientOrderId: data.clientOrderId as string }));
  }

  const ORDER_EVENT_HANDLERS: Record<string, ((data: OrderEventData) => void) | undefined> = {
    "orders.submitted": onOrderSubmittedOrNew,
    "orders.new": onOrderSubmittedOrNew,
    "orders.routed": onOrderRouted,
    "orders.child": onOrderChild,
    "orders.filled": onOrderFilled,
    "orders.expired": onOrderExpired,
    "orders.rejected": onOrderRejectedTopic,
    "orders.cancelled": onOrderCancelled,
  };

  function handleOrderEvent(topic: string, data: OrderEventData) {
    ORDER_EVENT_HANDLERS[topic]?.(data);
    storeAPI.dispatch(gridApi.util.invalidateTags(["Grid"]));
  }

  function connect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws = new WebSocket(GATEWAY_WS_URL);

    ws.onopen = () => {
      console.log("[gateway] Connected");
      reconnectDelay = 2_000;
      consecutiveFailures = 0;
      setGatewayWs(ws);
      storeAPI.dispatch(connectionRecovered());
      storeAPI.dispatch(marketSlice.actions.setConnected(true));
      fetch(`${GATEWAY_URL}/ready`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.upgradeInProgress !== undefined) {
            storeAPI.dispatch(
              setUpgradeStatus({
                inProgress: data.upgradeInProgress,
                message: data.upgradeMessage ?? null,
              })
            );
          }
        })
        .catch(() => {});
    };

    ws.onmessage = (event) => {
      handleGatewayMessage(event);
    };

    ws.onclose = (event?: CloseEvent) => {
      setGatewayWs(null);
      storeAPI.dispatch(marketSlice.actions.setConnected(false));
      storeAPI.dispatch(connectionFailed());
      consecutiveFailures += 1;
      for (const key of Object.keys(algoLastSeen)) delete algoLastSeen[key];
      if (tickTimer) {
        clearTimeout(tickTimer);
        tickTimer = null;
      }
      const code = event?.code ?? 0;
      const reason = event?.reason ?? "";
      const nextDelay =
        consecutiveFailures >= SHOW_BANNER_AFTER_FAILURES
          ? RECONNECT_DELAY_AFTER_GIVE_UP_MS
          : Math.min(reconnectDelay * 2, RECONNECT_DELAY_MAX_MS);
      console.warn(
        `[gateway] Disconnected (attempt ${consecutiveFailures}, code=${code}) — reconnecting in ${nextDelay}ms`
      );
      storeAPI.dispatch(
        reportError({
          message: `WebSocket disconnect (attempt ${consecutiveFailures})`,
          source: "gatewayMiddleware",
          severity: consecutiveFailures >= SHOW_BANNER_AFTER_FAILURES ? "error" : "warn",
          detail: { code, reason, nextDelayMs: nextDelay },
        })
      );
      reconnectDelay = nextDelay;
      reconnectTimer = setTimeout(() => {
        void scheduledReconnect();
      }, nextDelay);
    };

    ws.onerror = (event) => {
      console.warn("[gateway] WebSocket error", event);
      storeAPI.dispatch(
        reportError({
          message: "WebSocket error event",
          source: "gatewayMiddleware",
          severity: "warn",
        })
      );
      ws?.close();
    };
  }

  function handleGatewayMessage(event: MessageEvent) {
    let msg: { event: string; topic?: string; data: unknown };
    try {
      msg = JSON.parse(event.data as string) as typeof msg;
    } catch (err) {
      reportUnparseableFrame(event, err);
      return;
    }
    const handler = MESSAGE_HANDLERS[msg.event];
    handler?.(msg.data, msg.topic);
  }

  function reportUnparseableFrame(event: MessageEvent, err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const rawSnippet = typeof event.data === "string" ? event.data.slice(0, 500) : "<binary>";
    console.warn("[gateway] Unparseable frame", JSON.stringify({ err: errMsg, raw: rawSnippet }));
    storeAPI.dispatch(
      reportError({
        message: `Unparseable gateway frame: ${errMsg}`,
        source: "gatewayMiddleware",
        severity: "warn",
        stack: err instanceof Error ? err.stack : undefined,
        detail: { raw: rawSnippet },
      })
    );
  }

  function onMarketUpdate(data: unknown) {
    handleMarketUpdate(data as MarketUpdateData);
    storeAPI.dispatch(feedReceived("market"));
  }

  function onOrderEvent(data: unknown, topic?: string) {
    handleOrderEvent(topic ?? "", data as OrderEventData);
    storeAPI.dispatch(feedReceived("orders"));
  }

  function onOrderAck() {
    storeAPI.dispatch(gridApi.util.invalidateTags(["Grid"]));
  }

  function onOrderRejected(data: unknown) {
    const parsed = OrderRejectedSchema.safeParse(data);
    if (!parsed.success) {
      console.warn(
        "[gateway] orderRejected frame failed validation",
        JSON.stringify({ issues: parsed.error.issues, raw: data }).slice(0, 1000)
      );
      storeAPI.dispatch(
        reportError({
          message: "orderRejected frame failed validation",
          source: "gatewayMiddleware",
          severity: "warn",
          detail: { issues: parsed.error.issues, raw: data },
        })
      );
      return;
    }
    const { reason, clientOrderId } = parsed.data;
    console.warn("[gateway] Order rejected by gateway:", reason ?? "");
    storeAPI.dispatch(
      reportError({
        message: `Order rejected by gateway: ${reason ?? "(no reason)"}`,
        source: "gatewayMiddleware",
        severity: "warn",
        detail: { clientOrderId },
      })
    );
    if (clientOrderId) {
      storeAPI.dispatch(orderPatched({ id: clientOrderId, patch: { status: "rejected" } }));
    }
    storeAPI.dispatch(gridApi.util.invalidateTags(["Grid"]));
  }

  async function onAuthIdentity(data: unknown) {
    const identityData = data as { user: AuthUser; limits: TradingLimits };
    storeAPI.dispatch(setUserWithLimits(identityData));
    storeAPI.dispatch(loadGridPrefs() as unknown as UnknownAction);
    // Await prefs before seeding assets so the restored selectedAsset is
    // already in Redux when fetchAssetsAndSeedCandles checks alreadySelected.
    await (storeAPI.dispatch as (a: unknown) => Promise<unknown>)(
      loadUiPrefs() as unknown as UnknownAction
    );
    fetchAssetsAndSeedCandles().then(() => {
      const state = storeAPI.getState() as { ui: { selectedAsset: string | null } };
      if (state.ui.selectedAsset) hydrateNewsForSymbol(state.ui.selectedAsset);
    });
  }

  function onKillAck(data: unknown) {
    const killData = data as {
      scope: KillBlock["scope"];
      scopeValues?: string[];
      scopeValue?: string;
      targetUserId?: string;
      issuedBy: string;
    };
    storeAPI.dispatch(
      blockAdded({
        id: `block-${Date.now()}`,
        scope: killData.scope,
        scopeValues: killData.scopeValues ?? (killData.scopeValue ? [killData.scopeValue] : []),
        targetUserId: killData.targetUserId,
        issuedBy: killData.issuedBy,
        issuedAt: Date.now(),
        fromGateway: true,
      })
    );
    storeAPI.dispatch(gridApi.util.invalidateTags(["Grid"]));
  }

  function onResumeAck() {
    storeAPI.dispatch(allBlocksCleared());
    storeAPI.dispatch(gridApi.util.invalidateTags(["Grid"]));
  }

  function onAlgoHeartbeat(data: unknown) {
    const hb = data as { algo: string; ts?: number };
    if (!isSafeKey(hb.algo)) return;
    const now = Date.now();
    const prev = algoLastSeen[hb.algo];
    algoLastSeen[hb.algo] = now;
    storeAPI.dispatch(feedReceived("algo"));
    if (prev && now - prev > ALGO_HEARTBEAT_TIMEOUT_MS) {
      const gapSeconds = Math.round((now - prev) / 1000);
      storeAPI.dispatch(
        alertAdded({
          severity: "WARNING",
          source: "algo",
          message: `Algo ${hb.algo} heartbeat gap detected`,
          detail: `Last seen ${gapSeconds}s ago — heartbeat resumed`,
          ts: now,
          relatedTopic: "algo.heartbeat",
          relatedAt: prev,
        })
      );
    }
  }

  function onNewsUpdate(data: unknown) {
    storeAPI.dispatch(newsItemReceived(data as NewsItem));
    storeAPI.dispatch(feedReceived("news"));
  }

  function onSignalUpdate(data: unknown) {
    storeAPI.dispatch(signalReceived(data as Signal));
  }

  function onFeatureUpdate(data: unknown) {
    storeAPI.dispatch(featureReceived(data as FeatureVector));
  }

  function onRecommendationUpdate(data: unknown) {
    storeAPI.dispatch(recommendationReceived(data as TradeRecommendation));
  }

  function onAdvisoryUpdate(data: unknown) {
    storeAPI.dispatch(
      advisoryNoteReceived(
        data as {
          jobId: string;
          symbol: string;
          noteId: string;
          content: string;
          provider: string;
          modelId: string;
          createdAt: number;
        }
      )
    );
  }

  function onLlmStateUpdate(data: unknown) {
    storeAPI.dispatch(llmStateReceived(data as LlmSubsystemStatus));
  }

  function onRiskBreaker(data: unknown) {
    const br = data as {
      type: "market-move" | "user-pnl";
      scope: "symbol" | "user";
      scopeValue?: string;
      targetUserId?: string;
      observedValue: number;
      threshold: number;
      ts: number;
    };
    const target = br.scope === "symbol" ? (br.scopeValue ?? "") : (br.targetUserId ?? "");
    if (!target) return;
    storeAPI.dispatch(
      blockAdded({
        id: `breaker-${br.ts}-${br.scope}-${target}`,
        scope: br.scope,
        scopeValues: br.scope === "symbol" ? [target] : [],
        targetUserId: br.scope === "user" ? target : undefined,
        issuedBy: "circuit-breaker",
        issuedAt: br.ts,
        fromGateway: true,
      })
    );
    storeAPI.dispatch(breakerFired(br));
  }

  function onUpgradeStatus(data: unknown) {
    const upgrade = data as { inProgress: boolean; message?: string | null };
    storeAPI.dispatch(
      setUpgradeStatus({ inProgress: upgrade.inProgress, message: upgrade.message ?? null })
    );
  }

  function onServerError(data: unknown) {
    const parsed = ServerErrorSchema.safeParse(data);
    if (parsed.success) {
      const message = parsed.data.message ?? "";
      console.error("[gateway] Server error:", message);
      storeAPI.dispatch(
        reportError({
          message: `Server error: ${message}`,
          source: "gatewayMiddleware",
          severity: "error",
        })
      );
      return;
    }
    console.error(
      "[gateway] Server error frame failed validation",
      JSON.stringify({ issues: parsed.error.issues, raw: data }).slice(0, 1000)
    );
    storeAPI.dispatch(
      reportError({
        message: "Server error frame failed validation",
        source: "gatewayMiddleware",
        severity: "error",
        detail: { issues: parsed.error.issues, raw: data },
      })
    );
  }

  const MESSAGE_HANDLERS: Record<string, ((data: unknown, topic?: string) => void) | undefined> = {
    marketUpdate: onMarketUpdate,
    orderEvent: onOrderEvent,
    orderAck: onOrderAck,
    orderRejected: onOrderRejected,
    authIdentity: onAuthIdentity,
    killAck: onKillAck,
    resumeAck: onResumeAck,
    algoHeartbeat: onAlgoHeartbeat,
    newsUpdate: onNewsUpdate,
    signalUpdate: onSignalUpdate,
    featureUpdate: onFeatureUpdate,
    recommendationUpdate: onRecommendationUpdate,
    advisoryUpdate: onAdvisoryUpdate,
    llmStateUpdate: onLlmStateUpdate,
    riskBreaker: onRiskBreaker,
    upgradeStatus: onUpgradeStatus,
    error: onServerError,
  };

  async function scheduledReconnect() {
    try {
      const probe = await fetch(`${GATEWAY_URL}/health`, {
        credentials: "include",
        signal: AbortSignal.timeout(5_000),
      });
      if (probe.status === 401) {
        storeAPI.dispatch(
          reportError({
            message: "Gateway returned 401 during reconnect probe — session expired",
            source: "gatewayMiddleware",
            severity: "error",
          })
        );
        storeAPI.dispatch(sessionExpired());
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        return;
      }
    } catch {
      // probe failure is not fatal — try the WS anyway, it has its own backoff
    }
    connect();
  }

  function manualReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    consecutiveFailures = 0;
    reconnectDelay = RECONNECT_DELAY_INITIAL_MS;
    storeAPI.dispatch(connectionRecovered());
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.close();
      } catch {}
    } else {
      void scheduledReconnect();
    }
  }

  function nudgeReconnectIfStuck(reason: string, silent = false) {
    const state = storeAPI.getState() as { market?: { connected?: boolean } };
    if (state.market?.connected) return;
    if (!started) return;
    if (!silent) {
      storeAPI.dispatch(
        reportError({
          message: `Nudging reconnect: ${reason}`,
          source: "gatewayMiddleware",
          severity: "info",
        })
      );
    }
    manualReconnect();
  }

  function installRecoveryListeners() {
    if (visibilityListenerInstalled) return;
    if (typeof window === "undefined") return;
    visibilityListenerInstalled = true;
    globalThis.addEventListener("online", () => nudgeReconnectIfStuck("browser online event"));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        nudgeReconnectIfStuck("tab became visible");
      }
    });
    // User-activity nudges are opportunistic (every focus/click while
    // disconnected). They're not errors, so dispatched silently to avoid
    // flooding the error transport during outages.
    let lastUserNudgeAt = Number.NEGATIVE_INFINITY;
    const onUserActivity = () => {
      const now = Date.now();
      if (now - lastUserNudgeAt < 5_000) return;
      lastUserNudgeAt = now;
      nudgeReconnectIfStuck("user activity", true);
    };
    globalThis.addEventListener("focus", onUserActivity);
    document.addEventListener("click", onUserActivity);
  }

  async function fetchCandlesForAsset(symbol: string) {
    try {
      const [res1m, res5m] = await Promise.all([
        fetch(`${GATEWAY_URL}/candles?instrument=${symbol}&interval=1m&limit=120`, {
          credentials: "include",
        }),
        fetch(`${GATEWAY_URL}/candles?instrument=${symbol}&interval=5m&limit=120`, {
          credentials: "include",
        }),
      ]);
      const candles1m: OhlcCandle[] = res1m.ok ? await res1m.json() : [];
      const candles5m: OhlcCandle[] = res5m.ok ? await res5m.json() : [];
      storeAPI.dispatch(
        candlesSeeded({
          symbol,
          candles: { "1m": candles1m, "5m": candles5m },
        })
      );
    } catch {
      storeAPI.dispatch(candlesSeeded({ symbol, candles: { "1m": [], "5m": [] } }));
    }
  }

  async function fetchAssetsAndSeedCandles() {
    try {
      const r = await fetch(`${GATEWAY_URL}/assets`, { credentials: "include" });
      if (!r.ok) return;
      const data: AssetDef[] = await r.json();
      storeAPI.dispatch(marketSlice.actions.setAssets(data));
      if (data.length === 0) return;
      const alreadySelected = (storeAPI.getState() as { ui: { selectedAsset: string | null } }).ui
        .selectedAsset;
      if (!alreadySelected) storeAPI.dispatch(setSelectedAsset(data[0].symbol));
      await fetchCandlesForAsset(data[0].symbol);
      for (let i = 1; i < data.length; i++) {
        await new Promise((res) => setTimeout(res, 50));
        fetchCandlesForAsset(data[i].symbol);
      }
    } catch {
      // gateway unavailable
    }
  }

  async function hydrateNewsForSymbol(symbol: string) {
    try {
      const dispatch = storeAPI.dispatch as (action: unknown) => Promise<{ data?: NewsItem[] }>;
      const result = await dispatch(
        newsApi.endpoints.getNewsBySymbol.initiate({ symbol, limit: 50 })
      );
      if (result.data && result.data.length > 0) {
        storeAPI.dispatch(newsBatchReceived(result.data));
      }
    } catch {
      // news-aggregator unavailable
    }
  }

  function startGateway() {
    if (started) return;
    started = true;
    installRecoveryListeners();
    connect();
    if (breakerJanitorTimer === null) {
      breakerJanitorTimer = setInterval(() => {
        const state = storeAPI.getState() as {
          breakers?: { active: Array<{ key: string; expiresAt: number }> };
        };
        const active = state.breakers?.active ?? [];
        const now = Date.now();
        for (const a of active) {
          if (a.expiresAt <= now) storeAPI.dispatch(breakerExpired({ key: a.key }));
        }
      }, 1_000);
    }
  }

  function stopBreakerJanitor() {
    if (breakerJanitorTimer !== null) {
      clearInterval(breakerJanitorTimer);
      breakerJanitorTimer = null;
    }
  }

  return (next) => (action: unknown) => {
    const result = next(action);

    if (setUser.match(action as Parameters<typeof setUser.match>[0])) {
      startGateway();
    }

    if (setSelectedAsset.match(action as Parameters<typeof setSelectedAsset.match>[0])) {
      const symbol = (action as ReturnType<typeof setSelectedAsset>).payload;
      if (symbol) hydrateNewsForSymbol(symbol);
    }

    const type = (action as { type: string }).type;
    if (type === "marketFeed/stop") {
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopBreakerJanitor();
    }
    if (type === "gateway/reconnect") {
      manualReconnect();
    }
    return result;
  };
};

export const reconnectGateway = () => ({ type: "gateway/reconnect" as const });
