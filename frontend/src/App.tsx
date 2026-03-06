import type { IJsonModel } from "flexlayout-react";
import { Model } from "flexlayout-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DashboardLayout,
  DashboardProvider,
  makeAdminModel,
  makeClearModel,
} from "./components/DashboardLayout.tsx";
import { LoginPage } from "./components/LoginPage.tsx";
import { AppHeader, WorkspaceToolbar } from "./components/StatusBar.tsx";
import { seedWorkspaces, useWorkspaces, WorkspaceSidebar } from "./components/WorkspaceBar.tsx";
import { TradingProvider } from "./context/TradingContext.tsx";
import {
  fetchSharedWorkspace,
  loadWorkspacePrefs,
  saveWorkspacePrefs,
} from "./hooks/useWorkspaceSync.ts";
import type { AuthUser } from "./store/authSlice.ts";
import { setStatus, setUser } from "./store/authSlice.ts";
import { useAppDispatch, useAppSelector } from "./store/hooks.ts";

// ── Auth gate ──────────────────────────────────────────────────────────────────

function AuthGate({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);

  useEffect(() => {
    fetch("/api/user-service/sessions/me", { credentials: "include" })
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
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-500 text-sm">
        Loading...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <LoginPage />;
  }

  return <>{children}</>;
}

// ── TradingApp ─────────────────────────────────────────────────────────────────

function TradingApp() {
  const userId = useAppSelector((s) => s.auth.user?.id ?? "anonymous");
  const userRole = useAppSelector((s) => s.auth.user?.role);
  const authStatus = useAppSelector((s) => s.auth.status);

  const { workspaces, activeId, handleSelect, handleChange, setWorkspaces } = useWorkspaces(userId);

  // layouts map: workspaceId → Model instance
  const [layouts, setLayouts] = useState<Record<string, Model>>({});
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
      let finalWorkspaces = prefs?.workspaces ?? [];
      let finalLayoutsJson = prefs?.layouts ?? {};

      if (finalWorkspaces.length === 0) {
        const seed = seedWorkspaces();
        finalWorkspaces = seed.workspaces;
        finalLayoutsJson = seed.layouts;
        saveWorkspacePrefs({ workspaces: finalWorkspaces, layouts: finalLayoutsJson });
      }

      const loaded: Record<string, Model> = {};
      for (const [wsId, json] of Object.entries(finalLayoutsJson)) {
        try {
          loaded[wsId] = Model.fromJson(json);
        } catch {
          /* skip corrupted layout */
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
  }, [authStatus, setWorkspaces, handleSelect]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const sharedId = new URLSearchParams(window.location.search).get("shared");
    if (!sharedId) return;
    fetchSharedWorkspace(sharedId).then((entry) => {
      if (entry) setCloneBanner(entry);
    });
  }, [authStatus]);

  const savePrefs = useCallback(
    (nextWorkspaces: typeof workspaces, nextLayouts: Record<string, Model>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const layoutsJson: Record<string, IJsonModel> = {};
        for (const [id, m] of Object.entries(nextLayouts)) {
          layoutsJson[id] = m.toJson() as IJsonModel;
        }
        saveWorkspacePrefs({ workspaces: nextWorkspaces, layouts: layoutsJson });
      }, 500);
    },
    []
  );

  const handleWorkspacesChange = useCallback(
    (next: typeof workspaces) => {
      handleChange(next);
      savePrefs(next, layouts);
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
    // Remove ?shared= from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("shared");
    history.replaceState(null, "", url.toString());
  }

  const activeModel =
    layouts[activeId] ??
    (userRole === "admin" ? Model.fromJson(makeAdminModel()) : Model.fromJson(makeClearModel()));

  return (
    <TradingProvider>
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
        <AppHeader />

        {/* Share clone banner */}
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
      </div>
    </TradingProvider>
  );
}

export default function App() {
  return (
    <AuthGate>
      <TradingApp />
    </AuthGate>
  );
}
