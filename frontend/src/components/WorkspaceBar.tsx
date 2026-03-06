import { useSignal } from "@preact/signals-react";
import type { IJsonModel, Model } from "flexlayout-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { publishSharedWorkspace } from "../hooks/useWorkspaceSync.ts";
import {
  makeAdminModel,
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

const TRADER_PRESET_WORKSPACES: { id: string; name: string; makeModel: () => IJsonModel }[] = [
  { id: "ws-trading", name: "Trading", makeModel: makeDefaultModel },
  { id: "ws-analysis", name: "Analysis", makeModel: makeAnalysisModel },
  { id: "ws-algo", name: "Algo", makeModel: makeAlgoModel },
  { id: "ws-overview", name: "Overview", makeModel: makeOverviewModel },
];

const ADMIN_PRESET_WORKSPACES: { id: string; name: string; makeModel: () => IJsonModel }[] = [
  { id: "ws-mission-control", name: "Mission Control", makeModel: makeAdminModel },
  { id: "ws-overview", name: "Overview", makeModel: makeOverviewModel },
];

export function seedWorkspaces(role?: string): {
  workspaces: Workspace[];
  layouts: Record<string, IJsonModel>;
} {
  const presets = role === "admin" ? ADMIN_PRESET_WORKSPACES : TRADER_PRESET_WORKSPACES;
  const workspaces = presets.map(({ id, name }) => ({ id, name }));
  const layouts: Record<string, IJsonModel> = {};
  for (const preset of presets) {
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
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [shareDialog, setShareDialog] = useState<{ ws: Workspace; description: string } | null>(
    null
  );

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

  function shareWorkspace(ws: Workspace) {
    if (!layouts[ws.id]) return;
    setShareDialog({ ws, description: "" });
  }

  async function confirmShare() {
    if (!shareDialog) return;
    const { ws, description } = shareDialog;
    setShareDialog(null);
    const model = layouts[ws.id];
    if (!model) return;
    const id = await publishSharedWorkspace(ws.name, description, model.toJson() as IJsonModel);
    if (!id) return;
    setSharedIds((prev) => new Set([...prev, ws.id]));
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
                          title={
                            sharedIds.has(ws.id)
                              ? "Shared — click to copy link again"
                              : "Share workspace (copies link)"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            shareWorkspace(ws);
                          }}
                          className={`shrink-0 transition-all hover:scale-110 p-0.5 ${
                            sharedIds.has(ws.id)
                              ? "text-emerald-400 opacity-100 hover:text-emerald-300"
                              : "text-gray-300 opacity-0 group-hover:opacity-100 hover:text-emerald-300"
                          }`}
                        >
                          {/* Globe icon */}
                          <svg
                            aria-hidden="true"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="w-3 h-3"
                          >
                            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 1.5a5.5 5.5 0 0 1 4.91 3H10.5c-.2-.9-.54-1.71-.98-2.38A5.52 5.52 0 0 0 8 2.5Zm0 11a5.5 5.5 0 0 1-4.91-3H4.5c.2.9.54 1.71.98 2.38.45.67.97 1.14 1.52 1.42V13a.5.5 0 0 0 1 0v-.7c.55-.28 1.07-.75 1.52-1.42.44-.67.78-1.48.98-2.38h1.41A5.5 5.5 0 0 1 8 13.5Zm-1.5-2c-.37-.57-.66-1.28-.82-2H9.32c-.16.72-.45 1.43-.82 2H6.5Zm-2.41-2A5.52 5.52 0 0 1 4 8c0-.52.07-1.02.19-1.5H3.09A5.5 5.5 0 0 0 2.5 8c0 .52.07 1.02.19 1.5h1.4Zm.59-3h2.14C6.98 5.77 7.48 5.5 8 5.5s1.02.27 1.18.5H11.3A5.51 5.51 0 0 0 8 2.5a5.51 5.51 0 0 0-3.3 1.5H4.68Zm5.94 0h-1.4c.12.48.19.98.19 1.5 0 .52-.07 1.02-.19 1.5h1.4c.12-.48.19-.98.19-1.5 0-.52-.07-1.02-.19-1.5Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete workspace ${ws.name}`}
                          title={`Delete ${ws.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(ws.id);
                          }}
                          className="shrink-0 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 p-0.5"
                        >
                          {/* Trash icon */}
                          <svg
                            aria-hidden="true"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="w-3 h-3"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z"
                              clipRule="evenodd"
                            />
                          </svg>
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

      {shareDialog && (
        // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by buttons inside
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShareDialog(null);
          }}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-sm mx-4 p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold text-gray-200">
              Share &ldquo;{shareDialog.ws.name}&rdquo;
            </p>
            <textarea
              rows={3}
              placeholder="Add a description so others know what this workspace is for… (optional)"
              value={shareDialog.description}
              onChange={(e) =>
                setShareDialog((prev) =>
                  prev ? { ...prev, description: e.currentTarget.value } : prev
                )
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShareDialog(null)}
                className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
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
