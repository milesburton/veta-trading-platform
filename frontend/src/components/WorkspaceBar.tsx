import { useSignal } from "@preact/signals-react";
import { publishSharedWorkspace } from "@veta/frontend/hooks/useWorkspaceSync.ts";
import type { IJsonModel, Model } from "flexlayout-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  makeAdministrationModel,
  makeAdminObservabilityModel,
  makeAlgoModel,
  makeAnalysisModel,
  makeCommoditiesAnalysisModel,
  makeCommoditiesTradingModel,
  makeExecutionModel,
  makeFiAnalysisModel,
  makeFiResearchModel,
  makeFiTradingModel,
  makeMarketFeedsModel,
  makeOptionsModel,
  makeOverviewModel,
  makePipelineOpsModel,
  makeResearchModel,
  makeSystemStatusModel,
} from "./DashboardLayout.tsx";
import { SharedWorkspaceBrowser } from "./SharedWorkspaceBrowser.tsx";
import { WorkspaceListItem } from "./WorkspaceBar/WorkspaceListItem";

export interface Workspace {
  id: string;
  name: string;
  locked?: boolean;
  userLocked?: boolean;
}

const TRADER_PRESET_WORKSPACES: {
  id: string;
  name: string;
  locked: true;
  makeModel: () => IJsonModel;
}[] = [
  {
    id: "ws-trading",
    name: "Trading",
    locked: true,
    makeModel: makeExecutionModel,
  },
  { id: "ws-algo", name: "Algo", locked: true, makeModel: makeAlgoModel },
  {
    id: "ws-options",
    name: "Options",
    locked: true,
    makeModel: makeOptionsModel,
  },
  {
    id: "ws-analysis",
    name: "Analysis",
    locked: true,
    makeModel: makeAnalysisModel,
  },
  {
    id: "ws-research",
    name: "Research",
    locked: true,
    makeModel: makeResearchModel,
  },
  {
    id: "ws-commodities",
    name: "Commodities",
    locked: true,
    makeModel: makeCommoditiesTradingModel,
  },
  {
    id: "ws-commodities-analysis",
    name: "Cmdty Analysis",
    locked: true,
    makeModel: makeCommoditiesAnalysisModel,
  },
  {
    id: "ws-fi-trading",
    name: "FI Trading",
    locked: true,
    makeModel: makeFiTradingModel,
  },
  {
    id: "ws-fi-analysis",
    name: "FI Analysis",
    locked: true,
    makeModel: makeFiAnalysisModel,
  },
  {
    id: "ws-fi-research",
    name: "FI Research",
    locked: true,
    makeModel: makeFiResearchModel,
  },
  {
    id: "ws-overview",
    name: "Overview",
    locked: true,
    makeModel: makeOverviewModel,
  },
];

const ADMIN_PRESET_WORKSPACES: {
  id: string;
  name: string;
  locked: true;
  makeModel: () => IJsonModel;
}[] = [
  {
    id: "ws-market-feeds",
    name: "Market Feeds",
    locked: true,
    makeModel: makeMarketFeedsModel,
  },
  {
    id: "ws-system-status",
    name: "System Status",
    locked: true,
    makeModel: makeSystemStatusModel,
  },
  {
    id: "ws-observability",
    name: "Observability",
    locked: true,
    makeModel: makeAdminObservabilityModel,
  },
  {
    id: "ws-pipeline-ops",
    name: "Pipeline Ops",
    locked: true,
    makeModel: makePipelineOpsModel,
  },
  {
    id: "ws-administration",
    name: "Administration",
    locked: true,
    makeModel: makeAdministrationModel,
  },
  {
    id: "ws-overview",
    name: "Overview",
    locked: true,
    makeModel: makeOverviewModel,
  },
];

export function seedWorkspaces(role?: string): {
  workspaces: Workspace[];
  layouts: Record<string, IJsonModel>;
} {
  const presets = role === "admin" ? ADMIN_PRESET_WORKSPACES : TRADER_PRESET_WORKSPACES;
  const workspaces = presets.map(({ id, name, locked }) => ({
    id,
    name,
    locked,
  }));
  const layouts: Record<string, IJsonModel> = {};
  for (const preset of presets) {
    layouts[preset.id] = preset.makeModel();
  }
  return { workspaces, layouts };
}

/**
 * Reconciles a user's saved workspace list against the current preset definitions.
 *
 * For each preset workspace the user is missing (e.g. added in a newer release),
 * this inserts it at the correct position so the preset ordering is preserved.
 * Existing workspaces (including custom user ones) are kept intact.
 *
 * Returns the merged workspace list and any newly-seeded layout JSON that must be
 * saved alongside it.
 */
export function reconcilePresetWorkspaces(
  saved: Workspace[],
  layouts: Record<string, IJsonModel>,
  role?: string
): {
  workspaces: Workspace[];
  layouts: Record<string, IJsonModel>;
  restored: string[];
} {
  const presets = role === "admin" ? ADMIN_PRESET_WORKSPACES : TRADER_PRESET_WORKSPACES;
  const savedIds = new Set(saved.map((w) => w.id));
  const restored: string[] = [];
  const merged = [...saved];
  const newLayouts: Record<string, IJsonModel> = {};

  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i];
    if (savedIds.has(preset.id)) continue;

    const entry: Workspace = { id: preset.id, name: preset.name, locked: true };
    newLayouts[preset.id] = preset.makeModel();
    restored.push(preset.name);

    const prevPresetId = i > 0 ? presets[i - 1].id : null;
    const insertAfter = prevPresetId ? merged.findIndex((w) => w.id === prevPresetId) : -1;
    merged.splice(insertAfter + 1, 0, entry);
  }

  return {
    workspaces: merged,
    layouts: { ...layouts, ...newLayouts },
    restored,
  };
}

function loadPinned(): boolean {
  return localStorage.getItem("sidebar-pinned") !== "false";
}

function savePinned(pinned: boolean) {
  localStorage.setItem("sidebar-pinned", String(pinned));
}

const WORKSPACE_PARAM = "ws";

function getWorkspaceFromUrl(): string | null {
  return new URLSearchParams(globalThis.location.search).get(WORKSPACE_PARAM);
}

function pushWorkspaceHistory(workspaceId: string, workspaceName: string) {
  const url = new URL(globalThis.location.href);
  url.searchParams.set(WORKSPACE_PARAM, workspaceId);
  history.pushState({ workspaceId }, workspaceName, url.toString());
}

interface Props {
  activeId: string;
  onSelect: (id: string) => void;
  onWorkspacesChange: (ws: Workspace[]) => void;
  workspaces: Workspace[];
  layouts: Record<string, Model>;
  onCloneWorkspace?: (workspaceId: string, model: IJsonModel) => void;
}

export function WorkspaceSidebar({
  activeId,
  onSelect,
  onWorkspacesChange,
  workspaces,
  layouts,
  onCloneWorkspace,
}: Props) {
  const pinned = useSignal(loadPinned());
  const hovered = useSignal(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editingId = useSignal<string | null>(null);
  const editValue = useSignal("");
  const inputRef = useRef<HTMLInputElement>(null);

  const confirmDeleteId = useSignal<string | null>(null);
  const shareToast = useSignal<string | null>(null);
  const browseOpen = useSignal(false);
  const sharedIds = useSignal<Set<string>>(new Set());
  const shareDialog = useSignal<{ ws: Workspace; description: string } | null>(null);

  const isExpanded = pinned.value || hovered.value;

  useEffect(() => {
    if (editingId.value !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId.value]);

  function handleMouseEnter() {
    if (pinned.value) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hovered.value = true;
  }

  function handleMouseLeave() {
    if (pinned.value) return;
    hoverTimeoutRef.current = setTimeout(() => {
      hovered.value = false;
    }, 150);
  }

  function togglePin() {
    const next = !pinned.value;
    pinned.value = next;
    savePinned(next);
    if (!next) hovered.value = false;
  }

  const addWorkspace = useCallback(() => {
    const id = `ws-${Date.now()}`;
    const name = `Workspace ${workspaces.length + 1}`;
    const next = [...workspaces, { id, name }];
    onWorkspacesChange(next);
    onSelect(id);
  }, [workspaces, onSelect, onWorkspacesChange]);

  const renameWorkspace = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const ws = workspaces.find((w) => w.id === id);
      if (ws?.locked || ws?.userLocked) return;
      const next = workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w));
      onWorkspacesChange(next);
    },
    [workspaces, onWorkspacesChange]
  );

  const removeWorkspace = useCallback(
    (id: string) => {
      const ws = workspaces.find((w) => w.id === id);
      if (ws?.locked || ws?.userLocked) return;
      const next = workspaces.filter((w) => w.id !== id);
      onWorkspacesChange(next);
      if (activeId === id) onSelect(next[0]?.id ?? "");
    },
    [workspaces, activeId, onSelect, onWorkspacesChange]
  );

  const toggleUserLock = useCallback(
    (id: string) => {
      const ws = workspaces.find((w) => w.id === id);
      if (!ws || ws.locked) return;
      const next = workspaces.map((w) => (w.id === id ? { ...w, userLocked: !w.userLocked } : w));
      onWorkspacesChange(next);
    },
    [workspaces, onWorkspacesChange]
  );

  function commitRename() {
    if (editingId.value !== null) {
      renameWorkspace(editingId.value, editValue.value);
      editingId.value = null;
    }
  }

  function startRename(id: string, currentName: string) {
    editingId.value = id;
    editValue.value = currentName;
  }

  function shareWorkspace(ws: Workspace) {
    if (!layouts[ws.id] || ws.locked || ws.userLocked) return;
    shareDialog.value = { ws, description: "" };
  }

  async function confirmShare() {
    if (!shareDialog.value) return;
    const { ws, description } = shareDialog.value;
    shareDialog.value = null;
    const model = layouts[ws.id];
    if (!model) return;
    const id = await publishSharedWorkspace(ws.name, description, model.toJson() as IJsonModel);
    if (!id) return;
    sharedIds.value = new Set([...sharedIds.value, ws.id]);
    const url = `${globalThis.location.origin}${globalThis.location.pathname}?shared=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      shareToast.value = "Link copied!";
    } catch {
      shareToast.value = url;
    }
    setTimeout(() => {
      shareToast.value = null;
    }, 3000);
  }

  return (
    <>
      <nav
        data-testid="workspace-sidebar"
        aria-label="Workspace navigation"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`flex flex-col shrink-0 bg-page border-r border-panel transition-all duration-200 ${
          isExpanded ? "w-40" : "w-8"
        }`}
      >
        {/* ── Top bar ── */}
        <div className="flex items-center shrink-0 border-b border-panel h-8">
          <button
            type="button"
            data-testid="add-workspace-btn"
            aria-label="Add new workspace"
            title="Add new workspace"
            onClick={addWorkspace}
            className={`flex items-center gap-1.5 h-full text-emerald-600 hover:text-emerald-400 hover:bg-surface/60 transition-colors ${
              isExpanded ? "flex-1 px-2.5 text-[11px] font-semibold" : "w-8 justify-center"
            }`}
          >
            <span aria-hidden="true" className="text-base font-bold leading-none">
              +
            </span>
            {isExpanded && <span>New workspace</span>}
          </button>

          {isExpanded && (
            <>
              <button
                type="button"
                aria-label="Browse shared workspaces"
                title="Browse shared workspaces"
                onClick={() => {
                  browseOpen.value = true;
                }}
                className="flex items-center justify-center w-7 h-full shrink-0 text-emerald-600 hover:text-emerald-400 transition-colors text-sm"
              >
                ⊞
              </button>
              <button
                type="button"
                aria-label={pinned.value ? "Unpin sidebar" : "Pin sidebar open"}
                title={pinned.value ? "Unpin sidebar (auto-collapse)" : "Pin sidebar open"}
                onClick={togglePin}
                className={`flex items-center justify-center w-7 h-full shrink-0 transition-colors ${
                  pinned.value
                    ? "text-emerald-500 hover:text-emerald-400"
                    : "text-subtle hover:text-default"
                }`}
              >
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="w-3.5 h-3.5"
                >
                  {pinned.value ? (
                    <path
                      fillRule="evenodd"
                      d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H3.75A1.75 1.75 0 0 0 2 7.75v4.5C2 13.216 2.784 14 3.75 14h8.5A1.75 1.75 0 0 0 14 12.25v-4.5A1.75 1.75 0 0 0 12.25 6H11.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5V4.5a2 2 0 1 0-4 0V6h4Zm-1 4.25a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
                      clipRule="evenodd"
                    />
                  ) : (
                    <path d="M11.5 4.5a3.5 3.5 0 0 0-7 0V6H3.75A1.75 1.75 0 0 0 2 7.75v4.5C2 13.216 2.784 14 3.75 14h8.5A1.75 1.75 0 0 0 14 12.25v-4.5A1.75 1.75 0 0 0 12.25 6H11.5V4.5Zm-1.5 0V6h-4V4.5a2 2 0 1 1 4 0Zm-1 5.75a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
                  )}
                </svg>
              </button>
            </>
          )}
        </div>

        {/* ── Workspaces list ── */}
        <ul
          aria-label="Workspaces"
          className="flex-1 overflow-y-auto overflow-x-hidden list-none m-0 p-0"
        >
          {workspaces.map((ws) => (
            <WorkspaceListItem
              key={ws.id}
              ws={ws}
              active={ws.id === activeId}
              isEditing={editingId.value === ws.id}
              isConfirmingDelete={confirmDeleteId.value === ws.id}
              isExpanded={isExpanded}
              editValue={editValue}
              inputRef={inputRef}
              sharedIds={sharedIds}
              confirmDeleteId={confirmDeleteId}
              editingId={editingId}
              onSelect={onSelect}
              removeWorkspace={removeWorkspace}
              toggleUserLock={toggleUserLock}
              startRename={startRename}
              commitRename={commitRename}
              shareWorkspace={shareWorkspace}
            />
          ))}
        </ul>
      </nav>

      {shareToast.value && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-panel text-primary text-xs px-4 py-2 rounded shadow-lg border border-divider">
          {shareToast.value}
        </div>
      )}

      {browseOpen.value && (
        <SharedWorkspaceBrowser
          onClose={() => {
            browseOpen.value = false;
          }}
          onClone={(name, model) => {
            const newId = `ws-${Date.now()}`;
            const next = [...workspaces, { id: newId, name }];
            onWorkspacesChange(next);
            onSelect(newId);
            onCloneWorkspace?.(newId, model);
            browseOpen.value = false;
          }}
        />
      )}

      {shareDialog.value && (
        // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by buttons inside
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) shareDialog.value = null;
          }}
        >
          <div className="bg-surface border border-divider rounded-lg shadow-2xl w-full max-w-sm mx-4 p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold text-secondary">
              Share &ldquo;{shareDialog.value.ws.name}&rdquo;
            </p>
            <textarea
              rows={3}
              placeholder="Add a description so others know what this workspace is for… (optional)"
              value={shareDialog.value.description}
              onChange={(e) => {
                shareDialog.value = shareDialog.value
                  ? { ...shareDialog.value, description: e.currentTarget.value }
                  : shareDialog.value;
              }}
              className="w-full bg-panel border border-divider rounded px-3 py-2 text-xs text-secondary placeholder-subtle focus:outline-none focus:border-muted resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                title="Cancel sharing"
                onClick={() => {
                  shareDialog.value = null;
                }}
                className="px-3 py-1.5 rounded text-xs text-label hover:text-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                title="Share workspace and copy link"
                onClick={confirmShare}
                className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs transition-colors"
              >
                Share &amp; copy link
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const DEFAULT_WORKSPACE_BY_STYLE: Record<string, string> = {
  high_touch: "ws-trading",
  low_touch: "ws-algo",
  fi_voice: "ws-fi-trading",
  fx_electronic: "ws-algo",
  commodities_voice: "ws-commodities",
  derivatives_high_touch: "ws-options",
  derivatives_low_touch: "ws-algo",
  oversight: "ws-trading",
};

export function defaultWorkspaceForStyle(
  style: string | undefined,
  available: Workspace[]
): string {
  if (style) {
    const preferred = DEFAULT_WORKSPACE_BY_STYLE[style];
    if (preferred && available.find((w) => w.id === preferred)) return preferred;
  }
  return available[0]?.id ?? "";
}

export function useWorkspaces(_userId: string, tradingStyle?: string) {
  const seed = seedWorkspaces();

  const [workspaces, setWorkspacesState] = useState<Workspace[]>(seed.workspaces);

  const [activeId, setActiveId] = useState<string>(() => {
    const fromUrl = getWorkspaceFromUrl();
    const valid = seed.workspaces.find((w) => w.id === fromUrl);
    if (valid) return valid.id;
    return defaultWorkspaceForStyle(tradingStyle, seed.workspaces);
  });

  const setWorkspaces = useCallback((ws: Workspace[]) => {
    setWorkspacesState(ws);
    setActiveId((prev) => (ws.find((w) => w.id === prev) ? prev : (ws[0]?.id ?? "")));
  }, []);

  const initRef = useRef({ activeId, workspaces });
  useEffect(() => {
    const { activeId: id, workspaces: ws } = initRef.current;
    if (!getWorkspaceFromUrl()) {
      const match = ws.find((w) => w.id === id);
      pushWorkspaceHistory(id, match?.name ?? "Main");
    }
  }, []);

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const wsId = (e.state as { workspaceId?: string } | null)?.workspaceId;
      if (wsId) {
        setWorkspacesState((ws) => {
          const valid = ws.find((w) => w.id === wsId);
          if (valid) setActiveId(wsId);
          return ws;
        });
      }
    }
    globalThis.addEventListener("popstate", onPopState);
    return () => globalThis.removeEventListener("popstate", onPopState);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setWorkspacesState((ws) => {
      const match = ws.find((w) => w.id === id);
      pushWorkspaceHistory(id, match?.name ?? id);
      return ws;
    });
  }, []);

  const handleChange = useCallback((next: Workspace[]) => {
    setWorkspacesState(next);
  }, []);

  return { workspaces, activeId, handleSelect, handleChange, setWorkspaces };
}
