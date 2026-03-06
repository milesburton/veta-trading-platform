import { useSignal } from "@preact/signals-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";
import { useDashboard } from "./DashboardLayout.tsx";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
}

const DEFAULT_WORKSPACES: Workspace[] = [{ id: "default", name: "Main" }];

// ─── Per-user storage helpers ─────────────────────────────────────────────────

/** Storage key for the workspace list, scoped per user to prevent cross-user contamination. */
function workspacesKey(userId: string) {
  return `workspaces:${userId}`;
}

/** Storage key for a workspace's panel layout, scoped per user. */
export function workspaceStorageKey(userId: string, workspaceId: string) {
  return `dashboard-layout:${userId}:${workspaceId}`;
}

function loadWorkspaces(userId: string): Workspace[] {
  try {
    const raw = localStorage.getItem(workspacesKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Workspace[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // corrupted
  }
  return DEFAULT_WORKSPACES;
}

function saveWorkspaces(userId: string, ws: Workspace[]) {
  localStorage.setItem(workspacesKey(userId), JSON.stringify(ws));
}

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
}

export function WorkspaceSidebar({ activeId, onSelect, onWorkspacesChange, workspaces }: Props) {
  // Pinned = always expanded. Unpinned = collapses to icon strip, expands on hover.
  const pinned = useSignal(loadPinned());
  const hovered = useSignal(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editingId = useSignal<string | null>(null);
  const editValue = useSignal("");
  const inputRef = useRef<HTMLInputElement>(null);
  const userId = useAppSelector((s) => s.auth.user?.id ?? "anonymous");
  const { resetLayout: _resetLayout } = useDashboard();

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
    saveWorkspaces(userId, next);
    onWorkspacesChange(next);
    onSelect(id);
  }, [workspaces, onSelect, onWorkspacesChange, userId]);

  const renameWorkspace = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const next = workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w));
      saveWorkspaces(userId, next);
      onWorkspacesChange(next);
    },
    [workspaces, onWorkspacesChange, userId]
  );

  const removeWorkspace = useCallback(
    (id: string) => {
      if (workspaces.length <= 1) return;
      const next = workspaces.filter((w) => w.id !== id);
      saveWorkspaces(userId, next);
      onWorkspacesChange(next);
      if (activeId === id) onSelect(next[0].id);
    },
    [workspaces, activeId, onSelect, onWorkspacesChange, userId]
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

  return (
    <nav
      aria-label="Workspace navigation"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`flex flex-col shrink-0 bg-gray-950 border-r border-gray-800 transition-all duration-200 ${
        isExpanded ? "w-40" : "w-8"
      }`}
    >
      {/* ── Top bar: New workspace (left) + Pin (right) ── */}
      <div className="flex items-center shrink-0 border-b border-gray-800 h-8">
        {/* New workspace button — left, prominent */}
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

        {/* Pin button — right-aligned, only visible when expanded */}
        {isExpanded && (
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
            {/* 📌 = pinned, 📍 = unpinned */}
            <span aria-hidden="true">{pinned.value ? "📌" : "📍"}</span>
          </button>
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
                  {isEditing ? (
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
                  )}
                  {active && !isEditing && workspaces.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove workspace ${ws.name}`}
                      title={`Remove ${ws.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeWorkspace(ws.id);
                      }}
                      className="shrink-0 text-gray-700 hover:text-gray-400 text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
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
  );
}

// ─── Hook: manages workspace list state, history, and user-scoped storage ─────

export function useWorkspaces(userId: string) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => loadWorkspaces(userId));

  // Determine initial active workspace: prefer URL param, then first workspace
  const [activeId, setActiveId] = useState<string>(() => {
    const fromUrl = getWorkspaceFromUrl();
    const ws = loadWorkspaces(userId);
    const valid = ws.find((w) => w.id === fromUrl);
    return valid?.id ?? ws[0].id;
  });

  // Push initial history entry if none exists (so back button works from the start).
  const initRef = useRef({ activeId, workspaces });
  useEffect(() => {
    const { activeId: id, workspaces: ws } = initRef.current;
    if (!getWorkspaceFromUrl()) {
      const match = ws.find((w) => w.id === id);
      pushWorkspaceHistory(id, match?.name ?? "Main");
    }
  }, []);

  // Listen for browser back/forward navigation
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const wsId = (e.state as { workspaceId?: string } | null)?.workspaceId;
      if (wsId) {
        const ws = loadWorkspaces(userId);
        const valid = ws.find((w) => w.id === wsId);
        if (valid) setActiveId(wsId);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [userId]);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveId(id);
      const ws = workspaces.find((w) => w.id === id);
      pushWorkspaceHistory(id, ws?.name ?? id);
    },
    [workspaces]
  );

  const handleChange = useCallback((next: Workspace[]) => {
    setWorkspaces(next);
  }, []);

  return { workspaces, activeId, handleSelect, handleChange };
}
