import { configureStore } from "@reduxjs/toolkit";
import { advisoryApi } from "../store/advisoryApi.ts";
import { advisorySlice } from "../store/advisorySlice.ts";
import { alertsSlice } from "../store/alertsSlice.ts";
import { analyticsApi } from "../store/analyticsApi.ts";
import type { TradingLimits } from "../store/authSlice.ts";
import { authSlice } from "../store/authSlice.ts";
import { channelsSlice } from "../store/channelsSlice.ts";
import { feedSlice } from "../store/feedSlice.ts";
import { gatewayApi } from "../store/gatewayApi.ts";
import { gridApi } from "../store/gridApi.ts";
import { gridPrefsSlice } from "../store/gridPrefsSlice.ts";
import { intelligenceSlice } from "../store/intelligenceSlice.ts";
import { killSwitchSlice } from "../store/killSwitchSlice.ts";
import { llmSubsystemSlice } from "../store/llmSubsystemSlice.ts";
import { marketDataApi } from "../store/marketDataApi.ts";
import type { MarketState } from "../store/marketSlice.ts";
import { marketSlice } from "../store/marketSlice.ts";
import { newsApi } from "../store/newsApi.ts";
import { newsSlice } from "../store/newsSlice.ts";
import { observabilitySlice } from "../store/observabilitySlice.ts";
import { ordersSlice } from "../store/ordersSlice.ts";
import { servicesApi } from "../store/servicesApi.ts";
import { themeSlice } from "../store/themeSlice.ts";
import { uiSlice } from "../store/uiSlice.ts";
import { userApi } from "../store/userApi.ts";
import { windowSlice } from "../store/windowSlice.ts";

export type StoryPreloadedState = {
  market?: Partial<MarketState>;
  auth?: {
    user?: {
      id: string;
      name: string;
      role: "trader" | "admin" | "compliance" | "sales" | "external-client";
      avatar_emoji: string;
    } | null;
    limits?: TradingLimits;
    status?: "loading" | "authenticated" | "unauthenticated";
  };
  orders?: {
    orders?: import("../types.ts").OrderRecord[];
    lastSubmittedOrderId?: string | null;
  };
  ui?: {
    activeStrategy?: string;
    activeSide?: "BUY" | "SELL";
    showShortcuts?: boolean;
    selectedAsset?: string | null;
    updateAvailable?: boolean;
    upgradeStatus?: { inProgress: boolean; message: string | null };
    optionPrefill?: null;
    orderTicketWindowSize?: { w: number; h: number };
  };
  killSwitch?: { blocks?: import("../store/killSwitchSlice.ts").KillBlock[] };
};

/**
 * Create a Redux store for stories — same reducers as production but without
 * gatewayMiddleware (opens a WebSocket) or broadcast-channel middleware.
 */
export function storyStore(preloaded: StoryPreloadedState = {}) {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      feed: feedSlice.reducer,
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      news: newsSlice.reducer,
      observability: observabilitySlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      channels: channelsSlice.reducer,
      gridPrefs: gridPrefsSlice.reducer,
      theme: themeSlice.reducer,
      killSwitch: killSwitchSlice.reducer,
      alerts: alertsSlice.reducer,
      intelligence: intelligenceSlice.reducer,
      advisory: advisorySlice.reducer,
      llmSubsystem: llmSubsystemSlice.reducer,
      [servicesApi.reducerPath]: servicesApi.reducer,
      [analyticsApi.reducerPath]: analyticsApi.reducer,
      [marketDataApi.reducerPath]: marketDataApi.reducer,
      [advisoryApi.reducerPath]: advisoryApi.reducer,
      [gatewayApi.reducerPath]: gatewayApi.reducer,
      [gridApi.reducerPath]: gridApi.reducer,
      [newsApi.reducerPath]: newsApi.reducer,
      [userApi.reducerPath]: userApi.reducer,
    },
    preloadedState: preloaded as Parameters<typeof configureStore>[0]["preloadedState"],
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .concat(servicesApi.middleware)
        .concat(analyticsApi.middleware)
        .concat(marketDataApi.middleware)
        .concat(advisoryApi.middleware)
        .concat(gatewayApi.middleware)
        .concat(gridApi.middleware)
        .concat(newsApi.middleware)
        .concat(userApi.middleware),
  });
}
