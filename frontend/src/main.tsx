import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import "rrweb-player/dist/style.css";
import App from "./App.tsx";
import { PopOutHost } from "./components/PopOutHost.tsx";
import { TradingProvider } from "./context/TradingContext.tsx";
import { listenForStateRequests, requestStateFromMainWindow } from "./store/channel.ts";
import { hydrateFromSnapshot, type RootState, store } from "./store/index.ts";
import { reportError } from "./store/observabilitySlice.ts";
import { DEPLOYMENT } from "./store/servicesApi.ts";

const ENV_TITLE_TAG: Record<string, string> = {
  local: "[LOCAL]",
  uat: "[UAT]",
  fly: "[DEMO]",
};
const envTag = ENV_TITLE_TAG[DEPLOYMENT] ?? `[${DEPLOYMENT.toUpperCase()}]`;
document.title = `${envTag} VETA Trading Platform`;

globalThis.onerror = (_msg, source, _line, _col, error) => {
  store.dispatch(
    reportError({
      message: error?.message ?? String(_msg),
      source,
      stack: error?.stack,
    })
  );
};

globalThis.onunhandledrejection = (event) => {
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

const searchParams = new URLSearchParams(globalThis.location.search);
const instanceId = searchParams.get("panel");
const panelType = searchParams.get("type") ?? instanceId ?? "";
const layoutKey = searchParams.get("layout") ?? "dashboard-layout";

if (instanceId) {
  const renderPopOut = () =>
    createRoot(root).render(
      <StrictMode>
        <Provider store={store}>
          <TradingProvider>
            <PopOutHost instanceId={instanceId} panelType={panelType} layoutKey={layoutKey} />
          </TradingProvider>
        </Provider>
      </StrictMode>
    );

  requestStateFromMainWindow()
    .then((snapshot) => {
      if (snapshot && typeof snapshot === "object") {
        store.dispatch(hydrateFromSnapshot(snapshot as Partial<RootState>));
      }
    })
    .finally(renderPopOut);
} else {
  listenForStateRequests(() => store.getState());

  createRoot(root).render(
    <StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </StrictMode>
  );
}
