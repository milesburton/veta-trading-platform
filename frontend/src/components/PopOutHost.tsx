import type { UnknownAction } from "@reduxjs/toolkit";
import type { ChannelContextValue } from "@veta/frontend/contexts/ChannelContext.tsx";
import { ChannelContext, useChannelContext } from "@veta/frontend/contexts/ChannelContext.tsx";
import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import { DEPLOYMENT } from "@veta/frontend/store/servicesApi.ts";
import { saveOrderTicketWindowSize } from "@veta/frontend/store/uiSlice.ts";
import type { IJsonModel } from "flexlayout-react";
import { Model } from "flexlayout-react";
import type React from "react";
import { useEffect } from "react";
import { AdminPanel } from "./AdminPanel.tsx";
import { AlgoMonitor } from "./AlgoMonitor.tsx";
import { AnalysisPanel } from "./AnalysisPanel.tsx";
import { CandlestickChart } from "./CandlestickChart.tsx";
import type { LayoutItem, PanelId } from "./DashboardLayout.tsx";
import { modelToLayoutItems } from "./DashboardLayout.tsx";
import { DecisionLog } from "./DecisionLog.tsx";
import { CHANNEL_COLOURS, type ChannelNumber, PANEL_TITLES } from "./dashboard/panelRegistry.ts";
import { ExecutionsPanel } from "./ExecutionsPanel.tsx";
import { MarketDepth } from "./MarketDepth.tsx";
import { MarketHeatmap } from "./MarketHeatmap.tsx";
import { MarketLadder } from "./MarketLadder.tsx";
import { MarketMatch } from "./MarketMatch.tsx";
import { NewsSourcesPanel } from "./NewsSourcesPanel.tsx";
import { ObservabilityPanel } from "./ObservabilityPanel.tsx";
import { OrderBlotter } from "./OrderBlotter.tsx";
import { OrderProgressPanel } from "./OrderProgressPanel.tsx";
import { OrderTicket } from "./OrderTicket.tsx";

const ENV_TITLE_TAG: Record<string, string> = {
  local: "[LOCAL]",
  uat: "[UAT]",
  fly: "[DEMO]",
};
const envTag = ENV_TITLE_TAG[DEPLOYMENT] ?? `[${DEPLOYMENT.toUpperCase()}]`;

function CandleChartForPopOut() {
  const { incoming } = useChannelContext();
  const legacySelectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const channelsData = useAppSelector((s) => s.channels.data);
  const symbol =
    incoming !== null
      ? (channelsData[incoming]?.selectedAsset ?? legacySelectedAsset)
      : legacySelectedAsset;
  const candles = useAppSelector((s) => (symbol ? s.market.candleHistory[symbol] : undefined));
  const ready = useAppSelector((s) => (symbol ? s.market.candlesReady[symbol] : false));

  if (symbol && ready && candles && (candles["1m"].length >= 2 || candles["5m"].length >= 2)) {
    return <CandlestickChart key={symbol} symbol={symbol} candles={candles} />;
  }
  return (
    <div className="flex items-center justify-center h-full text-subtle text-xs">
      Waiting for candle data…
    </div>
  );
}

function MarketDepthForPopOut() {
  const { incoming } = useChannelContext();
  const legacySelectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const channelsData = useAppSelector((s) => s.channels.data);
  const symbol =
    incoming !== null
      ? (channelsData[incoming]?.selectedAsset ?? legacySelectedAsset)
      : (legacySelectedAsset ?? "AAPL");
  return <MarketDepth symbol={symbol ?? "AAPL"} />;
}

const PANEL_MAP: Record<string, React.ComponentType> = {
  "market-ladder": MarketLadder,
  "order-ticket": OrderTicket,
  "order-blotter": OrderBlotter,
  "algo-monitor": AlgoMonitor,
  observability: ObservabilityPanel,
  "candle-chart": CandleChartForPopOut,
  "market-depth": MarketDepthForPopOut,
  executions: ExecutionsPanel,
  "decision-log": DecisionLog,
  "market-match": MarketMatch,
  admin: AdminPanel,
  news: AnalysisPanel,
  "news-sources": NewsSourcesPanel,
  "order-progress": OrderProgressPanel,
  "market-heatmap": MarketHeatmap,
};

function loadChannelContext(
  instanceId: string,
  panelType: PanelId,
  layoutKey: string
): ChannelContextValue {
  try {
    const raw = localStorage.getItem(layoutKey);
    if (raw) {
      const parsed = JSON.parse(raw);

      if (parsed._v === 4 && parsed.flex) {
        const model = Model.fromJson(parsed.flex as IJsonModel);
        const items = modelToLayoutItems(model);
        const item = items.find((it) => it.i === instanceId);
        if (item) {
          return {
            instanceId,
            panelType,
            outgoing: item.outgoing ?? null,
            incoming: item.incoming ?? null,
          };
        }
      }

      if (parsed._v === 3 && Array.isArray(parsed.items)) {
        const items: LayoutItem[] = parsed.items;
        const item = items.find((it) => it.i === instanceId);
        if (item) {
          return {
            instanceId,
            panelType,
            outgoing: item.outgoing ?? null,
            incoming: item.incoming ?? null,
          };
        }
      }
    }
  } catch {
    // ignore parse errors
  }
  return { instanceId, panelType, outgoing: null, incoming: null };
}

function PopOutHeader({
  panelType,
  outgoing,
  incoming,
}: {
  panelType: string;
  outgoing: ChannelNumber | null;
  incoming: ChannelNumber | null;
}) {
  const channelsData = useAppSelector((s) => s.channels.data);
  const linkedSymbol = incoming !== null ? channelsData[incoming]?.selectedAsset : null;
  const title = PANEL_TITLES[panelType as PanelId] ?? panelType;
  const sessionPhase = useAppSelector((s) => s.market.sessionPhase);
  const connected = useAppSelector((s) => s.market.connected);

  return (
    <div className="flex items-center justify-between h-8 px-3 border-b border-panel bg-page/80 shrink-0 select-none">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-default uppercase tracking-wider">{title}</span>
        {linkedSymbol && (
          <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
            {linkedSymbol}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {incoming !== null && (
          <span
            className="flex items-center gap-1 text-[10px] text-muted"
            title={`Receiving from ${CHANNEL_COLOURS[incoming].label} channel`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: CHANNEL_COLOURS[incoming].hex }}
            />
            IN
          </span>
        )}
        {outgoing !== null && (
          <span
            className="flex items-center gap-1 text-[10px] text-muted"
            title={`Broadcasting to ${CHANNEL_COLOURS[outgoing].label} channel`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: CHANNEL_COLOURS[outgoing].hex }}
            />
            OUT
          </span>
        )}
        <span
          className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`}
          title={connected ? `Connected · ${sessionPhase}` : "Disconnected"}
        />
      </div>
    </div>
  );
}

export function PopOutHost({
  instanceId,
  panelType,
  layoutKey,
}: {
  instanceId: string;
  panelType: string;
  layoutKey: string;
}) {
  const theme = useAppSelector((s) => s.theme.theme);
  const dispatch = useAppDispatch();
  const PanelComponent = PANEL_MAP[panelType];
  const channelCtx = loadChannelContext(instanceId, panelType as PanelId, layoutKey);

  useEffect(() => {
    const title = PANEL_TITLES[panelType as PanelId] ?? panelType;
    document.title = `${envTag} ${title} — VETA`;
  }, [panelType]);

  useEffect(() => {
    if (panelType !== "order-ticket") return;
    let timer: ReturnType<typeof setTimeout>;
    function onResize() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        dispatch(
          saveOrderTicketWindowSize({
            w: globalThis.outerWidth,
            h: globalThis.outerHeight,
          }) as unknown as UnknownAction
        );
      }, 300);
    }
    globalThis.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      globalThis.removeEventListener("resize", onResize);
    };
  }, [panelType, dispatch]);

  if (!PanelComponent) {
    return (
      <div
        data-theme={theme}
        className="flex items-center justify-center h-screen bg-page text-muted text-sm"
      >
        Unknown panel: {panelType}
      </div>
    );
  }

  return (
    <ChannelContext.Provider value={channelCtx}>
      <div
        data-theme={theme}
        className="flex flex-col h-screen bg-page text-primary overflow-hidden"
      >
        <PopOutHeader
          panelType={panelType}
          outgoing={channelCtx.outgoing}
          incoming={channelCtx.incoming}
        />
        <div className="flex-1 overflow-hidden">
          <PanelComponent />
        </div>
      </div>
    </ChannelContext.Provider>
  );
}
