import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import "rrweb-player/dist/style.css";
import App from "./App.tsx";
import { PopOutHost } from "./components/PopOutHost.tsx";
import { TradingProvider } from "./context/TradingContext.tsx";
import { listenForStateRequests } from "./store/channel.ts";
import { store } from "./store/index.ts";
import { reportError } from "./store/observabilitySlice.ts";
import { DEPLOYMENT } from "./store/servicesApi.ts";

const ENV_TITLE_TAG: Record<string, string> = {
  local: "[LOCAL]",
  uat: "[UAT]",
  fly: "[DEMO]",
};
const envTag = ENV_TITLE_TAG[DEPLOYMENT] ?? `[${DEPLOYMENT.toUpperCase()}]`;
document.title = `${envTag} VETA Trading Platform`;

window.onerror = (_msg, source, _line, _col, error) => {
  store.dispatch(
    reportError({
      message: error?.message ?? String(_msg),
      source,
      stack: error?.stack,
    })
  );
};

window.onunhandledrejection = (event) => {
  const err = event.reason instanceof Error ? event.reason : null;
  store.dispatch(
    reportError({
      message: err?.message ?? String(event.reason),
      source: "unhandledrejection",
      stack: err?.stack,
    })
  );
};

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const searchParams = new URLSearchParams(window.location.search);
const instanceId = searchParams.get("panel");
const panelType = searchParams.get("type") ?? instanceId ?? "";
const layoutKey = searchParams.get("layout") ?? "dashboard-layout";

if (instanceId) {
  // Pop-out window mode: render just the requested panel.
  // TradingProvider must wrap PopOutHost because OrderTicket (and
  // potentially other panels) call useTradingContext at render time —
  // without it the hook throws and React unmounts the whole window,
  // leaving a blank screen.
  createRoot(root).render(
    <StrictMode>
      <Provider store={store}>
        <TradingProvider>
          <PopOutHost instanceId={instanceId} panelType={panelType} layoutKey={layoutKey} />
        </TradingProvider>
      </Provider>
    </StrictMode>
  );
} else {
  // Main window: start BroadcastChannel state listener for pop-outs
  listenForStateRequests(() => store.getState());

  createRoot(root).render(
    <StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </StrictMode>
  );
}
