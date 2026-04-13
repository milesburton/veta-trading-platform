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
import type { AssetDef, OhlcCandle, OrderBookSnapshot } from "../../types.ts";
import { advisoryNoteReceived } from "../advisorySlice.ts";
import { alertAdded } from "../alertsSlice.ts";
import type { AuthUser, TradingLimits } from "../authSlice.ts";
import { setUserWithLimits } from "../authSlice.ts";
import { feedReceived } from "../feedSlice.ts";
import { gridApi } from "../gridApi.ts";
import { loadGridPrefs } from "../gridPrefsSlice.ts";
import {
  type FeatureVector,
  featureReceived,
  recommendationReceived,
  type Signal,
  signalReceived,
  type TradeRecommendation,
} from "../intelligenceSlice.ts";
import type { KillBlock } from "../killSwitchSlice.ts";
import { allBlocksCleared, blockAdded } from "../killSwitchSlice.ts";
import { type LlmSubsystemStatus, llmStateReceived } from "../llmSubsystemSlice.ts";
import {
  candlesSeeded,
  type MarketPhase,
  marketSlice,
  orderBookUpdated,
  setSessionPhase,
} from "../marketSlice.ts";
import { newsApi } from "../newsApi.ts";
import type { NewsItem } from "../newsSlice.ts";
import { newsBatchReceived, newsItemReceived } from "../newsSlice.ts";
import {
  childAdded,
  fillReceived,
  orderCancelled,
  orderPatched,
  setGatewayWs,
} from "../ordersSlice.ts";
import { loadUiPrefs, setSelectedAsset, setUpgradeStatus } from "../uiSlice.ts";

const _origin = typeof window !== "undefined" ? window.location.origin : "";
const _wsOrigin = _origin.replace(/^http/, "ws");

const GATEWAY_WS_URL = import.meta.env.VITE_GATEWAY_WS_URL ?? `${_wsOrigin}/ws/gateway`;
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? `${_origin}/api/gateway`;

const UI_TICK_INTERVAL_MS = 250;
const ALGO_HEARTBEAT_TIMEOUT_MS = 10_000;

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
  side?: "BUY" | "SELL";
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
  let reconnectDelay = 2_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;

  const algoLastSeen: Record<string, number> = {};

  let pendingPrices: Record<string, number> | null = null;
  let pendingOpenPrices: Record<string, number> | null = null;
  let pendingVolumes: Record<string, number> = {};
  let pendingOrderBook: Record<string, OrderBookSnapshot> | null = null;
  let tickTimer: ReturnType<typeof setTimeout> | null = null;

  function flushTick() {
    tickTimer = null;
    if (!pendingPrices) return;
    storeAPI.dispatch(
      marketSlice.actions.tickReceived({
        prices: pendingPrices,
        openPrices: pendingOpenPrices ?? undefined,
        volumes: pendingVolumes,
        ts: Date.now(),
      })
    );
    if (pendingOrderBook) storeAPI.dispatch(orderBookUpdated(pendingOrderBook));
    pendingPrices = null;
    pendingOpenPrices = null;
    pendingVolumes = {};
    pendingOrderBook = null;
  }

  function handleMarketUpdate(data: MarketUpdateData) {
    pendingPrices = data.prices;
    if (data.openPrices) pendingOpenPrices = data.openPrices;
    for (const [sym, vol] of Object.entries(data.volumes ?? {})) {
      pendingVolumes[sym] = (pendingVolumes[sym] ?? 0) + vol;
    }
    if (data.orderBook) pendingOrderBook = data.orderBook;
    if (data.sessionPhase) {
      storeAPI.dispatch(setSessionPhase(data.sessionPhase as MarketPhase));
    }
    if (!tickTimer) tickTimer = setTimeout(flushTick, UI_TICK_INTERVAL_MS);
  }

  function handleOrderEvent(topic: string, data: OrderEventData) {
    switch (topic) {
      case "orders.submitted":
      case "orders.new": {
        if (data.orderId) {
          storeAPI.dispatch(
            orderPatched({
              id: data.clientOrderId ?? data.orderId,
              patch: { status: "pending" },
            })
          );
        }
        break;
      }
      case "orders.routed": {
        if (data.orderId) {
          storeAPI.dispatch(
            orderPatched({
              id: data.clientOrderId ?? data.orderId,
              patch: { status: "working" },
            })
          );
        }
        break;
      }
      case "orders.child": {
        if (data.parentOrderId && data.childId) {
          storeAPI.dispatch(
            childAdded({
              parentId: data.clientOrderId ?? data.parentOrderId,
              child: {
                id: data.childId,
                parentId: data.clientOrderId ?? data.parentOrderId,
                asset: data.asset ?? "",
                side: data.side ?? "BUY",
                quantity: data.quantity ?? 0,
                limitPrice: data.limitPrice ?? 0,
                status: "working",
                filled: 0,
                submittedAt: data.ts ?? Date.now(),
              },
            })
          );
        }
        break;
      }
      case "orders.filled": {
        if (data.parentOrderId && data.filledQty != null) {
          storeAPI.dispatch(
            fillReceived({
              clOrdId: data.clientOrderId ?? data.parentOrderId,
              filledQty: data.filledQty,
              avgFillPrice: data.avgFillPrice ?? 0,
              leavesQty: data.remainingQty ?? 0,
            })
          );
          if (data.childId) {
            storeAPI.dispatch(
              childAdded({
                parentId: data.clientOrderId ?? data.parentOrderId,
                child: {
                  id: data.childId,
                  parentId: data.clientOrderId ?? data.parentOrderId,
                  asset: data.asset ?? "",
                  side: data.side ?? "BUY",
                  quantity: data.filledQty,
                  limitPrice: data.avgFillPrice ?? 0,
                  status: "filled",
                  filled: data.filledQty,
                  submittedAt: data.ts ?? Date.now(),
                  avgFillPrice: data.avgFillPrice,
                  commissionUSD: data.commissionUSD,
                  venue: data.venue as import("../../types.ts").VenueMIC | undefined,
                  counterparty: data.counterparty,
                  liquidityFlag: data.liquidityFlag,
                  settlementDate: data.settlementDate,
                },
              })
            );
          }
        }
        break;
      }
      case "orders.expired": {
        if (data.orderId) {
          storeAPI.dispatch(
            orderPatched({
              id: data.clientOrderId ?? data.orderId,
              patch: { status: "expired" },
            })
          );
        }
        break;
      }
      case "orders.rejected": {
        if (data.clientOrderId) {
          storeAPI.dispatch(
            orderPatched({
              id: data.clientOrderId,
              patch: { status: "rejected" },
            })
          );
        }
        break;
      }
      case "orders.cancelled": {
        if (data.clientOrderId) {
          storeAPI.dispatch(orderCancelled({ clientOrderId: data.clientOrderId as string }));
        }
        break;
      }
    }
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
      setGatewayWs(ws);
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
      try {
        const msg = JSON.parse(event.data as string) as {
          event: string;
          topic?: string;
          data: unknown;
        };

        switch (msg.event) {
          case "marketUpdate":
            handleMarketUpdate(msg.data as MarketUpdateData);
            storeAPI.dispatch(feedReceived("market"));
            break;
          case "orderEvent":
            handleOrderEvent(msg.topic ?? "", msg.data as OrderEventData);
            storeAPI.dispatch(feedReceived("orders"));
            break;
          case "orderAck": {
            storeAPI.dispatch(gridApi.util.invalidateTags(["Grid"]));
            break;
          }
          case "orderRejected": {
            const rejData = msg.data as {
              reason?: string;
              clientOrderId?: string;
            };
            console.warn("[gateway] Order rejected by gateway:", rejData.reason);
            if (rejData.clientOrderId) {
              storeAPI.dispatch(
                orderPatched({
                  id: rejData.clientOrderId,
                  patch: { status: "rejected" },
                })
              );
            }
            storeAPI.dispatch(gridApi.util.invalidateTags(["Grid"]));
            break;
          }
          case "authIdentity": {
            const identityData = msg.data as {
              user: AuthUser;
              limits: TradingLimits;
            };
            storeAPI.dispatch(setUserWithLimits(identityData));
            storeAPI.dispatch(loadGridPrefs() as unknown as UnknownAction);
            storeAPI.dispatch(loadUiPrefs() as unknown as UnknownAction);
            break;
          }
          case "killAck": {
            const killData = msg.data as {
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
                scopeValues:
                  killData.scopeValues ?? (killData.scopeValue ? [killData.scopeValue] : []),
                targetUserId: killData.targetUserId,
                issuedBy: killData.issuedBy,
                issuedAt: Date.now(),
                fromGateway: true,
              })
            );
            storeAPI.dispatch(gridApi.util.invalidateTags(["Grid"]));
            break;
          }
          case "resumeAck":
            storeAPI.dispatch(allBlocksCleared());
            storeAPI.dispatch(gridApi.util.invalidateTags(["Grid"]));
            break;
          case "algoHeartbeat": {
            const hb = msg.data as { algo: string; ts?: number };
            const now = Date.now();
            const prev = algoLastSeen[hb.algo];
            algoLastSeen[hb.algo] = now;
            storeAPI.dispatch(feedReceived("algo"));
            if (prev && now - prev > ALGO_HEARTBEAT_TIMEOUT_MS) {
              storeAPI.dispatch(
                alertAdded({
                  severity: "WARNING",
                  source: "algo",
                  message: `Algo ${hb.algo} heartbeat resumed after ${Math.round(
                    (now - prev) / 1000
                  )}s gap`,
                  ts: now,
                })
              );
            }
            break;
          }
          case "newsUpdate":
            storeAPI.dispatch(newsItemReceived(msg.data as NewsItem));
            storeAPI.dispatch(feedReceived("news"));
            break;
          case "signalUpdate":
            storeAPI.dispatch(signalReceived(msg.data as Signal));
            break;
          case "featureUpdate":
            storeAPI.dispatch(featureReceived(msg.data as FeatureVector));
            break;
          case "recommendationUpdate":
            storeAPI.dispatch(recommendationReceived(msg.data as TradeRecommendation));
            break;
          case "advisoryUpdate": {
            const advisoryData = msg.data as {
              jobId: string;
              symbol: string;
              noteId: string;
              content: string;
              provider: string;
              modelId: string;
              createdAt: number;
            };
            storeAPI.dispatch(advisoryNoteReceived(advisoryData));
            break;
          }
          case "llmStateUpdate":
            storeAPI.dispatch(llmStateReceived(msg.data as LlmSubsystemStatus));
            break;
          case "upgradeStatus": {
            const upgrade = msg.data as { inProgress: boolean; message?: string | null };
            storeAPI.dispatch(
              setUpgradeStatus({ inProgress: upgrade.inProgress, message: upgrade.message ?? null })
            );
            break;
          }
          case "error":
            console.error("[gateway] Server error:", (msg.data as { message?: string }).message);
            break;
        }
      } catch {
        // ignore unparseable frames
      }
    };

    ws.onclose = () => {
      setGatewayWs(null);
      storeAPI.dispatch(marketSlice.actions.setConnected(false));
      for (const key of Object.keys(algoLastSeen)) delete algoLastSeen[key];
      if (tickTimer) {
        clearTimeout(tickTimer);
        tickTimer = null;
      }
      console.warn(`[gateway] Disconnected — reconnecting in ${reconnectDelay}ms`);
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        connect();
      }, reconnectDelay);
    };

    ws.onerror = () => ws?.close();
  }

  async function fetchCandlesForAsset(symbol: string) {
    try {
      const [res1m, res5m] = await Promise.all([
        fetch(`${GATEWAY_URL}/candles?instrument=${symbol}&interval=1m&limit=120`),
        fetch(`${GATEWAY_URL}/candles?instrument=${symbol}&interval=5m&limit=120`),
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
      const r = await fetch(`${GATEWAY_URL}/assets`);
      if (!r.ok) return;
      const data: AssetDef[] = await r.json();
      storeAPI.dispatch(marketSlice.actions.setAssets(data));
      if (data.length === 0) return;
      storeAPI.dispatch(setSelectedAsset(data[0].symbol));
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

  if (!started) {
    started = true;
    fetchAssetsAndSeedCandles().then(() => {
      const state = storeAPI.getState() as {
        ui: { selectedAsset: string | null };
      };
      if (state.ui.selectedAsset) hydrateNewsForSymbol(state.ui.selectedAsset);
    });
    connect();
  }

  return (next) => (action: unknown) => {
    const result = next(action);

    if (setSelectedAsset.match(action as Parameters<typeof setSelectedAsset.match>[0])) {
      const symbol = (action as ReturnType<typeof setSelectedAsset>).payload;
      if (symbol) hydrateNewsForSymbol(symbol);
    }

    if ((action as { type: string }).type === "marketFeed/stop") {
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    }
    return result;
  };
};
