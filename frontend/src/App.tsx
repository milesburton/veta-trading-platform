import type { IJsonModel } from "flexlayout-react";
import { Model } from "flexlayout-react";
import type { ReactNode } from "react";
import { Component, useCallback, useEffect, useRef, useState } from "react";
import {
  DashboardLayout,
  DashboardProvider,
  makeAdminModel,
  makeClearModel,
} from "./components/DashboardLayout.tsx";
import { LoginPage } from "./components/LoginPage.tsx";
import { OrderTicket } from "./components/OrderTicket.tsx";
import { StartupOverlay } from "./components/StartupOverlay.tsx";
import { AppHeader, WorkspaceToolbar } from "./components/StatusBar.tsx";
import {
  reconcilePresetWorkspaces,
  seedWorkspaces,
  useWorkspaces,
  WorkspaceSidebar,
} from "./components/WorkspaceBar.tsx";
import { TradingProvider } from "./context/TradingContext.tsx";
import {
  fetchSharedWorkspace,
  loadWorkspacePrefs,
  saveWorkspacePrefs,
} from "./hooks/useWorkspaceSync.ts";
import type { Alert } from "./store/alertsSlice.ts";
import {
  alertDismissed,
  alertsLoaded,
  purgeServiceAlerts,
  selectActiveAlerts,
  selectCriticalAlerts,
} from "./store/alertsSlice.ts";
import type { AuthUser } from "./store/authSlice.ts";
import { setStatus, setUser } from "./store/authSlice.ts";
import { useAppDispatch, useAppSelector } from "./store/hooks.ts";
import { store } from "./store/index.ts";
import { reportError } from "./store/observabilitySlice.ts";
import { loadTheme } from "./store/themeSlice.ts";
import { closeOrderTicket } from "./store/uiSlice.ts";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? "/api/gateway";
const USER_SERVICE_URL = import.meta.env.VITE_USER_SERVICE_URL ?? "/api/user-service";

const TOAST_EPOCH = Date.now();

function ToastHost() {
  const alerts = useAppSelector(selectActiveAlerts);
  const dispatch = useAppDispatch();
  const [shown, setShown] = useState<Set<string>>(new Set());

  const toastable = alerts.filter(
    (a) =>
      (a.severity === "WARNING" || a.severity === "INFO") &&
      a.source !== "service" &&
      !shown.has(a.id) &&
      a.ts >= TOAST_EPOCH
  );

  useEffect(() => {
    for (const a of toastable) {
      setShown((prev) => new Set([...prev, a.id]));
      const id = a.id;
      setTimeout(() => dispatch(alertDismissed(id)), 6000);
    }
  }, [toastable, dispatch]);

  const visible = alerts.filter(
    (a) => (a.severity === "WARNING" || a.severity === "INFO") && shown.has(a.id)
  );

  if (visible.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {visible.map((a) => (
        <div
          key={a.id}
          className={`flex items-center gap-3 text-xs px-4 py-2 rounded shadow-lg pointer-events-auto border ${
            a.severity === "WARNING"
              ? "bg-amber-900 border-amber-700 text-amber-200"
              : "bg-gray-800 border-gray-700 text-gray-300"
          }`}
        >
          <span>{a.message}</span>
          <button
            type="button"
            onClick={() => dispatch(alertDismissed(a.id))}
            className="opacity-60 hover:opacity-100 leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  componentDidCatch(error: Error) {
    store.dispatch(
      reportError({ message: error.message, source: "ErrorBoundary", stack: error.stack })
    );
    this.setState({ crashed: true });
  }
  render() {
    if (this.state.crashed) {
      return (
        <div
          data-testid="error-boundary"
          className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-gray-300 gap-4"
        >
          <p className="text-lg font-semibold">Something went wrong.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-sm"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);

  useEffect(() => {
    fetch(`${USER_SERVICE_URL}/sessions/me`, { credentials: "include" })
      .then(async (res) => {
        if (res.ok) {
          const user: AuthUser = await res.json();
          dispatch(setUser(user));
        } else {
          dispatch(setStatus("unauthenticated"));
        }
      })
      .catch(() => dispatch(setStatus("unauthenticated")));
  }, [dispatch]);

  if (status === "loading") {
    return (
      <div
        data-testid="auth-loading"
        className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-500 text-sm"
      >
        Loading...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <LoginPage
        buildDate={import.meta.env.VITE_BUILD_DATE}
        commitSha={import.meta.env.VITE_COMMIT_SHA}
      />
    );
  }

  return <>{children}</>;
}

function TradingApp() {
  const userId = useAppSelector((s) => s.auth.user?.id ?? "anonymous");
  const userRole = useAppSelector((s) => s.auth.user?.role);
  const dispatch = useAppDispatch();
  const criticalAlerts = useAppSelector(selectCriticalAlerts);
  const latestCritical = criticalAlerts[0] ?? null;
  const authStatus = useAppSelector((s) => s.auth.status);
  const theme = useAppSelector((s) => s.theme.theme);
  const orderTicketOpen = useAppSelector((s) => s.ui.orderTicketOpen);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const { workspaces, activeId, handleSelect, handleChange, setWorkspaces } = useWorkspaces(userId);

  const locallyModifiedRef = useRef(false);

  const [layouts, setLayouts] = useState<Record<string, Model>>(() => {
    const seed = seedWorkspaces();
    const initial: Record<string, Model> = {};
    for (const [id, json] of Object.entries(seed.layouts)) {
      try {
        initial[id] = Model.fromJson(json);
      } catch {
        // ignore
      }
    }
    return initial;
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cloneBanner, setCloneBanner] = useState<{
    id: string;
    name: string;
    ownerName: string;
    model: IJsonModel;
  } | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    loadWorkspacePrefs().then((prefs) => {
      if (locallyModifiedRef.current) return;

      let finalWorkspaces = prefs?.workspaces ?? [];
      let finalLayoutsJson = prefs?.layouts ?? {};

      if (finalWorkspaces.length === 0) {
        const seed = seedWorkspaces(userRole);
        finalWorkspaces = seed.workspaces;
        finalLayoutsJson = seed.layouts;
        saveWorkspacePrefs({ workspaces: finalWorkspaces, layouts: finalLayoutsJson });
      } else {
        const { workspaces: presetWs } = seedWorkspaces(userRole);
        const lockedIds = new Set(presetWs.filter((w) => w.locked).map((w) => w.id));
        finalWorkspaces = finalWorkspaces.map((w) =>
          lockedIds.has(w.id) ? { ...w, locked: true as const } : w
        );
        const reconciled = reconcilePresetWorkspaces(finalWorkspaces, finalLayoutsJson, userRole);
        if (reconciled.restored.length > 0) {
          finalWorkspaces = reconciled.workspaces;
          finalLayoutsJson = reconciled.layouts;
          saveWorkspacePrefs({ workspaces: finalWorkspaces, layouts: finalLayoutsJson });
        }
      }

      const loaded: Record<string, Model> = {};
      for (const [wsId, json] of Object.entries(finalLayoutsJson)) {
        try {
          loaded[wsId] = Model.fromJson(json);
        } catch {
          // ignore corrupted layout
        }
      }

      const urlWsId = new URLSearchParams(window.location.search).get("ws");
      const preferred =
        urlWsId && finalWorkspaces.find((w) => w.id === urlWsId)
          ? urlWsId
          : (finalWorkspaces[0]?.id ?? "");

      setWorkspaces(finalWorkspaces);
      setLayouts(loaded);
      if (preferred) handleSelect(preferred);
    });
  }, [authStatus, setWorkspaces, handleSelect, userRole]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    dispatch(loadTheme());
  }, [authStatus, dispatch]);

  useEffect(() => {
    dispatch(purgeServiceAlerts());
  }, [dispatch]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    fetch(`${GATEWAY_URL}/alerts`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as Alert[];
        dispatch(alertsLoaded(data.filter((a) => a.source !== "service")));
      })
      .catch(() => {});
  }, [authStatus, dispatch]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const sharedId = new URLSearchParams(window.location.search).get("shared");
    if (!sharedId) return;
    fetchSharedWorkspace(sharedId).then((entry) => {
      if (entry) setCloneBanner(entry);
    });
  }, [authStatus]);

  const pendingSaveRef = useRef<{
    workspaces: typeof workspaces;
    layouts: Record<string, Model>;
  } | null>(null);

  const savePrefs = useCallback(
    (nextWorkspaces: typeof workspaces, nextLayouts: Record<string, Model>) => {
      pendingSaveRef.current = { workspaces: nextWorkspaces, layouts: nextLayouts };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        pendingSaveRef.current = null;
        const layoutsJson: Record<string, IJsonModel> = {};
        for (const [id, m] of Object.entries(nextLayouts)) {
          layoutsJson[id] = m.toJson() as IJsonModel;
        }
        saveWorkspacePrefs({ workspaces: nextWorkspaces, layouts: layoutsJson });
      }, 500);
    },
    []
  );

  useEffect(() => {
    function flushOnUnload() {
      if (!pendingSaveRef.current) return;
      const { workspaces: ws, layouts: ls } = pendingSaveRef.current;
      const layoutsJson: Record<string, IJsonModel> = {};
      for (const [id, m] of Object.entries(ls)) {
        layoutsJson[id] = m.toJson() as IJsonModel;
      }
      saveWorkspacePrefs({ workspaces: ws, layouts: layoutsJson });
    }
    window.addEventListener("beforeunload", flushOnUnload);
    return () => window.removeEventListener("beforeunload", flushOnUnload);
  }, []);

  const handleWorkspacesChange = useCallback(
    (next: typeof workspaces) => {
      locallyModifiedRef.current = true;
      handleChange(next);
      const existingIds = new Set(Object.keys(layouts));
      const newLayouts = { ...layouts };
      for (const ws of next) {
        if (!existingIds.has(ws.id)) {
          newLayouts[ws.id] = Model.fromJson(makeClearModel());
        }
      }
      setLayouts(newLayouts);
      savePrefs(next, newLayouts);
    },
    [handleChange, layouts, savePrefs]
  );

  const handleModelChange = useCallback(
    (m: Model) => {
      setLayouts((prev) => {
        const next = { ...prev, [activeId]: m };
        savePrefs(workspaces, next);
        return next;
      });
    },
    [activeId, workspaces, savePrefs]
  );

  function cloneSharedWorkspace() {
    if (!cloneBanner) return;
    const newId = `ws-${Date.now()}`;
    const newWorkspaces = [...workspaces, { id: newId, name: cloneBanner.name }];
    const newModel = Model.fromJson(cloneBanner.model);
    const newLayouts = { ...layouts, [newId]: newModel };
    setWorkspaces(newWorkspaces);
    setLayouts(newLayouts);
    handleSelect(newId);
    savePrefs(newWorkspaces, newLayouts);
    setCloneBanner(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("shared");
    history.replaceState(null, "", url.toString());
  }

  const activeModel =
    layouts[activeId] ??
    (userRole === "admin" ? Model.fromJson(makeAdminModel()) : Model.fromJson(makeClearModel()));

  return (
    <TradingProvider>
      <div
        data-testid="trading-app"
        data-theme={theme}
        className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden"
      >
        <AppHeader />

        {latestCritical && (
          <div className="flex items-center gap-3 px-4 py-2 bg-red-950 border-b border-red-800 text-sm text-red-200 shrink-0">
            <span className="font-bold text-red-400 shrink-0">⚠ CRITICAL</span>
            <span className="flex-1 truncate">{latestCritical.message}</span>
            {latestCritical.detail && (
              <span className="text-red-400 text-xs shrink-0">{latestCritical.detail}</span>
            )}
            <button
              type="button"
              onClick={() => dispatch(alertDismissed(latestCritical.id))}
              className="shrink-0 text-red-500 hover:text-red-300 text-lg leading-none transition-colors"
            >
              ×
            </button>
          </div>
        )}

        {cloneBanner && (
          <div className="flex items-center gap-3 px-4 py-2 bg-emerald-950 border-b border-emerald-800 text-sm text-emerald-200 shrink-0">
            <span>
              <span className="font-semibold">{cloneBanner.ownerName}</span> shared workspace{" "}
              <span className="font-semibold">&ldquo;{cloneBanner.name}&rdquo;</span> — clone it
              into your account?
            </span>
            <button
              type="button"
              onClick={cloneSharedWorkspace}
              className="px-2.5 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
            >
              Clone
            </button>
            <button
              type="button"
              onClick={() => setCloneBanner(null)}
              className="px-2 py-0.5 rounded text-emerald-500 hover:text-emerald-300 text-xs transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          <DashboardProvider
            key={`${userId}:${activeId}`}
            model={activeModel}
            onModelChange={handleModelChange}
          >
            <WorkspaceSidebar
              workspaces={workspaces}
              activeId={activeId}
              onSelect={handleSelect}
              onWorkspacesChange={handleWorkspacesChange}
              layouts={layouts}
              onCloneWorkspace={(wsId, model) => {
                const newModel = Model.fromJson(model);
                setLayouts((prev) => {
                  const next = { ...prev, [wsId]: newModel };
                  savePrefs(workspaces, next);
                  return next;
                });
              }}
            />
            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              <WorkspaceToolbar />
              <div className="flex-1 relative min-h-0">
                <DashboardLayout />
              </div>
            </div>
          </DashboardProvider>
        </div>

        {orderTicketOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New Order"
            data-testid="order-ticket-dialog"
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <button
              type="button"
              aria-label="Close order ticket"
              className="absolute inset-0 bg-black/70"
              onClick={() => dispatch(closeOrderTicket())}
            />
            <div className="relative z-10 w-[420px] max-h-[90vh] overflow-auto bg-gray-950 border border-gray-700 rounded-lg shadow-2xl">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  New Order
                </span>
                <button
                  type="button"
                  onClick={() => dispatch(closeOrderTicket())}
                  aria-label="Close order ticket dialog"
                  className="text-gray-500 hover:text-gray-300 text-lg leading-none transition-colors"
                >
                  ×
                </button>
              </div>
              <OrderTicket />
            </div>
          </div>
        )}
      </div>
    </TradingProvider>
  );
}

const BOOTING_WINDOW_MS = 120_000;

export default function App() {
  // "unknown" = haven't checked yet; "overlay" = show startup overlay; "ready" = go straight in
  const [platformState, setPlatformState] = useState<"unknown" | "overlay" | "ready">("unknown");

  useEffect(() => {
    // Do a single rapid check: if the platform is already up and has been
    // running for >2 minutes, skip the startup overlay entirely.
    let cancelled = false;
    fetch(`${GATEWAY_URL}/ready`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { ready: boolean; startedAt?: number };
          if (data.ready && data.startedAt && Date.now() - data.startedAt > BOOTING_WINDOW_MS) {
            setPlatformState("ready");
          } else {
            setPlatformState("overlay");
          }
        } else {
          setPlatformState("overlay");
        }
      })
      .catch(() => {
        if (!cancelled) setPlatformState("overlay");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (platformState === "unknown") {
    // Brief blank screen while we do the initial check (~100ms)
    return <div className="min-h-screen bg-gray-950" />;
  }

  return (
    <ErrorBoundary>
      {platformState === "overlay" && (
        <StartupOverlay
          onReady={() => setPlatformState("ready")}
          buildDate={import.meta.env.VITE_BUILD_DATE}
          commitSha={import.meta.env.VITE_COMMIT_SHA}
        />
      )}
      {platformState === "ready" && (
        <AuthGate>
          <TradingApp />
        </AuthGate>
      )}
      <ToastHost />
    </ErrorBoundary>
  );
}
