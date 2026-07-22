import type { Workspace } from "@veta/frontend/components/WorkspaceBar.tsx";
import type { IJsonModel } from "flexlayout-react";

export interface WorkspacePrefs {
  workspaces: Workspace[];
  layouts: Record<string, IJsonModel>;
}

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? "/api/gateway";

let cachedOtherPrefs: Record<string, unknown> = {};

export async function loadWorkspacePrefs(): Promise<WorkspacePrefs | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/preferences`, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.json();
    const { workspaces, layouts, ...rest } = blob ?? {};
    cachedOtherPrefs = rest;
    if (!Array.isArray(workspaces) || workspaces.length === 0) return null;
    return { workspaces, layouts: layouts ?? {} };
  } catch {
    return null;
  }
}

export async function saveWorkspacePrefs(prefs: WorkspacePrefs): Promise<void> {
  try {
    const res = await fetch(`${GATEWAY_URL}/preferences`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        ...cachedOtherPrefs,
        workspaces: prefs.workspaces,
        layouts: prefs.layouts,
      }),
    });
    if (!res.ok) {
      globalThis.dispatchEvent(
        new CustomEvent("workspace-save-error", {
          detail: { status: res.status },
        })
      );
    }
  } catch {
    globalThis.dispatchEvent(
      new CustomEvent("workspace-save-error", {
        detail: { status: 0 },
      })
    );
  }
}

export interface SharedWorkspaceEntry {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmoji: string;
  name: string;
  description: string;
  createdAt: number;
}

export interface SharedWorkspaceDetail extends SharedWorkspaceEntry {
  model: IJsonModel;
}

export async function listSharedWorkspaces(): Promise<SharedWorkspaceEntry[]> {
  const res = await fetch(`${GATEWAY_URL}/shared-workspaces`, { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

// docs: /platform/security/
const SHARED_WORKSPACE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function fetchSharedWorkspace(id: string): Promise<SharedWorkspaceDetail | null> {
  if (!SHARED_WORKSPACE_ID_RE.test(id)) return null;
  try {
    const res = await fetch(`${GATEWAY_URL}/shared-workspaces/${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function publishSharedWorkspace(
  name: string,
  description: string,
  model: IJsonModel
): Promise<string | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/shared-workspaces`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, model }),
    });
    if (!res.ok) return null;
    const { id } = await res.json();
    return id as string;
  } catch {
    return null;
  }
}

export async function deleteSharedWorkspace(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${GATEWAY_URL}/shared-workspaces/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}
