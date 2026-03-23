import { configureStore } from "@reduxjs/toolkit";
import { advisoryApi } from "./advisoryApi.ts";
import { advisorySlice } from "./advisorySlice.ts";
import { alertsSlice } from "./alertsSlice.ts";
import { analyticsApi } from "./analyticsApi.ts";
import { authSlice } from "./authSlice.ts";
import { createBroadcastChannelMiddleware } from "./channel.ts";
import { channelsSlice } from "./channelsSlice.ts";
import { feedSlice } from "./feedSlice.ts";
import { gatewayApi } from "./gatewayApi.ts";
import { gridApi } from "./gridApi.ts";
import { gridPrefsSlice } from "./gridPrefsSlice.ts";
import { intelligenceSlice } from "./intelligenceSlice.ts";
import { killSwitchSlice } from "./killSwitchSlice.ts";
import { llmSubsystemSlice } from "./llmSubsystemSlice.ts";
import { marketDataApi } from "./marketDataApi.ts";
import { marketSlice } from "./marketSlice.ts";
import { alertsMiddleware } from "./middleware/alertsMiddleware.ts";
import { gatewayMiddleware } from "./middleware/gatewayMiddleware.ts";
import { simulationMiddleware } from "./middleware/simulationMiddleware.ts";
import { versionWatchMiddleware } from "./middleware/versionWatchMiddleware.ts";
import { newsApi } from "./newsApi.ts";
import { newsSlice } from "./newsSlice.ts";
import { observabilitySlice } from "./observabilitySlice.ts";
import { ordersSlice } from "./ordersSlice.ts";
import { servicesApi } from "./servicesApi.ts";
import { themeSlice } from "./themeSlice.ts";
import { uiSlice } from "./uiSlice.ts";
import { userApi } from "./userApi.ts";
import { windowSlice } from "./windowSlice.ts";

export const store = configureStore({
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
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(servicesApi.middleware)
      .concat(analyticsApi.middleware)
      .concat(marketDataApi.middleware)
      .concat(advisoryApi.middleware)
      .concat(gatewayApi.middleware)
      .concat(gridApi.middleware)
      .concat(newsApi.middleware)
      .concat(userApi.middleware)
      .concat(gatewayMiddleware)
      .concat(alertsMiddleware)
      .concat(simulationMiddleware.middleware)
      .concat(versionWatchMiddleware)
      .concat(createBroadcastChannelMiddleware()),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
