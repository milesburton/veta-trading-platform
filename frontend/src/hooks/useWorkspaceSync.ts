import type { IJsonModel } from "flexlayout-react";
import type { Workspace } from "../components/WorkspaceBar.tsx";

export interface WorkspacePrefs {
  workspaces: Workspace[];
  layouts: Record<string, IJsonModel>;
}

let cachedOtherPrefs: Record<string, unknown> = {};

export async function loadWorkspacePrefs(): Promise<WorkspacePrefs | null> {
  try {
    const res = await fetch("/api/gateway/preferences");
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
    await fetch("/api/gateway/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...cachedOtherPrefs,
        workspaces: prefs.workspaces,
        layouts: prefs.layouts,
      }),
    });
  } catch {
    // fire-and-forget — silently ignore network errors
  }
}

export interface SharedWorkspaceEntry {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmoji: string;
  name: string;
  createdAt: number;
}

export interface SharedWorkspaceDetail extends SharedWorkspaceEntry {
  model: IJsonModel;
}

export async function listSharedWorkspaces(): Promise<SharedWorkspaceEntry[]> {
  const res = await fetch("/api/gateway/shared-workspaces");
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSharedWorkspace(id: string): Promise<SharedWorkspaceDetail | null> {
  try {
    const res = await fetch(`/api/gateway/shared-workspaces/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function publishSharedWorkspace(
  name: string,
  model: IJsonModel
): Promise<string | null> {
  try {
    const res = await fetch("/api/gateway/shared-workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, model }),
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
    const res = await fetch(`/api/gateway/shared-workspaces/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}
