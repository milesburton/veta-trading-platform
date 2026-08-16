import { combineReducers, configureStore, createAction, type Reducer } from "@reduxjs/toolkit";
import { advisoryApi } from "./advisoryApi.ts";
import { advisorySlice } from "./advisorySlice.ts";
import { alertsSlice } from "./alertsSlice.ts";
import { analyticsApi } from "./analyticsApi.ts";
import { authSlice } from "./authSlice.ts";
import { breakersSlice } from "./breakersSlice.ts";
import { createBroadcastChannelMiddleware } from "./channel.ts";
import { channelsSlice } from "./channelsSlice.ts";
import { feedSlice } from "./feedSlice.ts";
import { fixApi } from "./fixApi.ts";
import { gatewayApi } from "./gatewayApi.ts";
import { gridApi } from "./gridApi.ts";
import { gridPrefsSlice } from "./gridPrefsSlice.ts";
import { intelligenceSlice } from "./intelligenceSlice.ts";
import { killSwitchSlice } from "./killSwitchSlice.ts";
import { llmSubsystemSlice } from "./llmSubsystemSlice.ts";
import { marketDataApi } from "./marketDataApi.ts";
import { marketSlice } from "./marketSlice.ts";
import { alertsMiddleware } from "./middleware/alertsMiddleware.ts";
import { errorTransportMiddleware } from "./middleware/errorTransportMiddleware.ts";
import { gatewayMiddleware } from "./middleware/gatewayMiddleware.ts";
import { simulationMiddleware } from "./middleware/simulationMiddleware.ts";
import { versionWatchMiddleware } from "./middleware/versionWatchMiddleware.ts";
import { newsApi } from "./newsApi.ts";
import { newsSlice } from "./newsSlice.ts";
import { observabilitySlice } from "./observabilitySlice.ts";
import { ordersSlice } from "./ordersSlice.ts";
import { parseTicketApi } from "./parseTicketApi.ts";
import { replayApi } from "./replayApi.ts";
import { riskApi } from "./riskApi.ts";
import { scenariosApi } from "./scenariosApi.ts";
import { servicesApi } from "./servicesApi.ts";
import { themeSlice } from "./themeSlice.ts";
import { uiSlice } from "./uiSlice.ts";
import { userApi } from "./userApi.ts";
import { windowSlice } from "./windowSlice.ts";

const combinedReducer = combineReducers({
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
  breakers: breakersSlice.reducer,
  alerts: alertsSlice.reducer,
  intelligence: intelligenceSlice.reducer,
  advisory: advisorySlice.reducer,
  llmSubsystem: llmSubsystemSlice.reducer,
  [servicesApi.reducerPath]: servicesApi.reducer,
  [analyticsApi.reducerPath]: analyticsApi.reducer,
  [marketDataApi.reducerPath]: marketDataApi.reducer,
  [advisoryApi.reducerPath]: advisoryApi.reducer,
  [fixApi.reducerPath]: fixApi.reducer,
  [gatewayApi.reducerPath]: gatewayApi.reducer,
  [gridApi.reducerPath]: gridApi.reducer,
  [newsApi.reducerPath]: newsApi.reducer,
  [parseTicketApi.reducerPath]: parseTicketApi.reducer,
  [replayApi.reducerPath]: replayApi.reducer,
  [riskApi.reducerPath]: riskApi.reducer,
  [scenariosApi.reducerPath]: scenariosApi.reducer,
  [userApi.reducerPath]: userApi.reducer,
});

type CombinedState = ReturnType<typeof combinedReducer>;

export const hydrateFromSnapshot = createAction<Partial<CombinedState>>("store/HYDRATE");

const rootReducer: Reducer<CombinedState> = (state, action) => {
  if (hydrateFromSnapshot.match(action) && state) {
    return { ...state, ...action.payload };
  }
  return combinedReducer(state, action);
};

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(servicesApi.middleware)
      .concat(analyticsApi.middleware)
      .concat(marketDataApi.middleware)
      .concat(advisoryApi.middleware)
      .concat(fixApi.middleware)
      .concat(gatewayApi.middleware)
      .concat(gridApi.middleware)
      .concat(newsApi.middleware)
      .concat(parseTicketApi.middleware)
      .concat(replayApi.middleware)
      .concat(riskApi.middleware)
      .concat(scenariosApi.middleware)
      .concat(userApi.middleware)
      .concat(gatewayMiddleware)
      .concat(alertsMiddleware)
      .concat(simulationMiddleware.middleware)
      .concat(versionWatchMiddleware)
      .concat(errorTransportMiddleware)
      .concat(createBroadcastChannelMiddleware()),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
