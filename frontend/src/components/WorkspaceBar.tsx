import { useSignal } from "@preact/signals-react";
import type { IJsonModel, Model } from "flexlayout-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { publishSharedWorkspace } from "../hooks/useWorkspaceSync.ts";
import {
  makeAlgoModel,
  makeAnalysisModel,
  makeDefaultModel,
  makeOverviewModel,
} from "./DashboardLayout.tsx";
import { SharedWorkspaceBrowser } from "./SharedWorkspaceBrowser.tsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
}

const PRESET_WORKSPACES: { id: string; name: string; makeModel: () => IJsonModel }[] = [
  { id: "ws-trading", name: "Trading", makeModel: makeDefaultModel },
  { id: "ws-analysis", name: "Analysis", makeModel: makeAnalysisModel },
  { id: "ws-algo", name: "Algo", makeModel: makeAlgoModel },
  { id: "ws-overview", name: "Overview", makeModel: makeOverviewModel },
];

export function seedWorkspaces(): { workspaces: Workspace[]; layouts: Record<string, IJsonModel> } {
  const workspaces = PRESET_WORKSPACES.map(({ id, name }) => ({ id, name }));
  const layouts: Record<string, IJsonModel> = {};
  for (const preset of PRESET_WORKSPACES) {
    layouts[preset.id] = preset.makeModel();
  }
  return { workspaces, layouts };
}

// ─── Storage key (exported for backwards compat, no longer used for layouts) ──

export function workspaceStorageKey(_userId: string, _workspaceId: string): string {
  return "";
}

// ─── Pin state ────────────────────────────────────────────────────────────────

function loadPinned(): boolean {
  return localStorage.getItem("sidebar-pinned") !== "false";
}

function savePinned(pinned: boolean) {
  localStorage.setItem("sidebar-pinned", String(pinned));
}

// ─── History helpers ──────────────────────────────────────────────────────────

const WORKSPACE_PARAM = "ws";

function getWorkspaceFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(WORKSPACE_PARAM);
}

function pushWorkspaceHistory(workspaceId: string, workspaceName: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(WORKSPACE_PARAM, workspaceId);
  history.pushState({ workspaceId }, workspaceName, url.toString());
}

// ─── Vertical workspace sidebar ───────────────────────────────────────────────

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

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);

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
      const next = workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w));
      onWorkspacesChange(next);
    },
    [workspaces, onWorkspacesChange]
  );

  const removeWorkspace = useCallback(
    (id: string) => {
      const next = workspaces.filter((w) => w.id !== id);
      onWorkspacesChange(next);
      if (activeId === id) onSelect(next[0]?.id ?? "");
    },
    [workspaces, activeId, onSelect, onWorkspacesChange]
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

  async function shareWorkspace(ws: Workspace) {
    const model = layouts[ws.id];
    if (!model) return;
    const id = await publishSharedWorkspace(ws.name, model.toJson() as IJsonModel);
    if (!id) return;
    const url = `${window.location.origin}${window.location.pathname}?shared=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareToast("Link copied!");
    } catch {
      setShareToast(url);
    }
    setTimeout(() => setShareToast(null), 3000);
  }

  return (
    <>
      <nav
        aria-label="Workspace navigation"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`flex flex-col shrink-0 bg-gray-950 border-r border-gray-800 transition-all duration-200 ${
          isExpanded ? "w-40" : "w-8"
        }`}
      >
        {/* ── Top bar ── */}
        <div className="flex items-center shrink-0 border-b border-gray-800 h-8">
          <button
            type="button"
            aria-label="Add new workspace"
            title="Add new workspace"
            onClick={addWorkspace}
            className={`flex items-center gap-1.5 h-full text-emerald-600 hover:text-emerald-400 hover:bg-gray-900/60 transition-colors ${
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
                onClick={() => setBrowseOpen(true)}
                className="flex items-center justify-center w-7 h-full shrink-0 text-gray-600 hover:text-gray-300 transition-colors text-sm"
              >
                ⊞
              </button>
              <button
                type="button"
                aria-label={pinned.value ? "Unpin sidebar" : "Pin sidebar open"}
                title={pinned.value ? "Unpin sidebar (auto-collapse)" : "Pin sidebar open"}
                onClick={togglePin}
                className={`flex items-center justify-center w-7 h-full shrink-0 transition-colors text-base ${
                  pinned.value
                    ? "text-emerald-500 hover:text-emerald-400"
                    : "text-gray-600 hover:text-gray-300"
                }`}
              >
                <span aria-hidden="true">{pinned.value ? "📌" : "📍"}</span>
              </button>
            </>
          )}
        </div>

        {/* ── Workspaces list ── */}
        <ul
          aria-label="Workspaces"
          className="flex-1 overflow-y-auto overflow-x-hidden list-none m-0 p-0"
        >
          {workspaces.map((ws) => {
            const active = ws.id === activeId;
            const isEditing = editingId.value === ws.id;
            const isConfirmingDelete = confirmDeleteId === ws.id;

            return (
              <li
                key={ws.id}
                className={`group relative flex items-center border-b border-gray-800/60 ${
                  active
                    ? "bg-gray-900 border-l-2 border-l-emerald-500"
                    : "border-l-2 border-l-transparent hover:bg-gray-900/40"
                }`}
              >
                {isExpanded ? (
                  <div className="flex items-center w-full min-w-0 px-2 py-1.5 gap-1">
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1 w-full min-w-0">
                        <span className="flex-1 text-[10px] text-gray-400 truncate">
                          Delete &ldquo;{ws.name}&rdquo;?
                        </span>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[10px] text-gray-500 hover:text-gray-300 px-1"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(null);
                            removeWorkspace(ws.id);
                          }}
                          className="text-[10px] text-red-500 hover:text-red-400 px-1"
                        >
                          Delete
                        </button>
                      </div>
                    ) : isEditing ? (
                      <input
                        ref={inputRef}
                        aria-label={`Rename workspace ${ws.name}`}
                        value={editValue.value}
                        onChange={(e) => {
                          editValue.value = e.target.value;
                        }}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") {
                            editingId.value = null;
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 bg-gray-800 text-gray-100 text-[11px] px-1 rounded outline-none border border-emerald-500"
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`Switch to workspace: ${ws.name}`}
                          aria-current={active ? "page" : undefined}
                          title="Click to switch · Right-click to rename"
                          className={`flex-1 min-w-0 text-left text-[11px] truncate bg-transparent border-0 p-0 cursor-pointer ${
                            active ? "text-gray-200" : "text-gray-500 hover:text-gray-300"
                          }`}
                          onClick={() => onSelect(ws.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            startRename(ws.id, ws.name);
                          }}
                        >
                          {ws.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Share workspace ${ws.name}`}
                          title="Share workspace (copies link)"
                          onClick={(e) => {
                            e.stopPropagation();
                            shareWorkspace(ws);
                          }}
                          className="shrink-0 text-gray-700 hover:text-emerald-400 text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete workspace ${ws.name}`}
                          title={`Delete ${ws.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(ws.id);
                          }}
                          className="shrink-0 text-gray-700 hover:text-red-400 text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`Switch to workspace: ${ws.name}`}
                    aria-current={active ? "page" : undefined}
                    title={`Switch to workspace: ${ws.name}`}
                    onClick={() => onSelect(ws.id)}
                    className={`flex items-center justify-center w-8 h-8 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                      active ? "text-emerald-400" : "text-gray-600 hover:text-gray-300"
                    }`}
                  >
                    {ws.name.charAt(0)}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {shareToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-gray-100 text-xs px-4 py-2 rounded shadow-lg border border-gray-700">
          {shareToast}
        </div>
      )}

      {browseOpen && (
        <SharedWorkspaceBrowser
          onClose={() => setBrowseOpen(false)}
          onClone={(name, model) => {
            const newId = `ws-${Date.now()}`;
            const next = [...workspaces, { id: newId, name }];
            onWorkspacesChange(next);
            onSelect(newId);
            onCloneWorkspace?.(newId, model);
            setBrowseOpen(false);
          }}
        />
      )}
    </>
  );
}

// ─── Hook: manages workspace list state and history ───────────────────────────

export function useWorkspaces(_userId: string) {
  const seed = seedWorkspaces();

  const [workspaces, setWorkspacesState] = useState<Workspace[]>(seed.workspaces);

  const [activeId, setActiveId] = useState<string>(() => {
    const fromUrl = getWorkspaceFromUrl();
    const valid = seed.workspaces.find((w) => w.id === fromUrl);
    return valid?.id ?? seed.workspaces[0]?.id ?? "";
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
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
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
