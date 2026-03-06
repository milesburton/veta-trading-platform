import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import App from "./App.tsx";
import { PopOutHost } from "./components/PopOutHost.tsx";
import { queryClient } from "./lib/queryClient.ts";
import { listenForStateRequests } from "./store/channel.ts";
import { store } from "./store/index.ts";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const searchParams = new URLSearchParams(window.location.search);
const instanceId = searchParams.get("panel");
const panelType = searchParams.get("type") ?? instanceId ?? "";
const layoutKey = searchParams.get("layout") ?? "dashboard-layout";

if (instanceId) {
  // Pop-out window mode: render just the requested panel
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <PopOutHost instanceId={instanceId} panelType={panelType} layoutKey={layoutKey} />
        </Provider>
      </QueryClientProvider>
    </StrictMode>
  );
} else {
  // Main window: start BroadcastChannel state listener for pop-outs
  listenForStateRequests(() => store.getState());

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <App />
        </Provider>
      </QueryClientProvider>
    </StrictMode>
  );
}
