import type { IJsonModel } from "flexlayout-react";
import { useEffect, useState } from "react";
import type { SharedWorkspaceEntry } from "../hooks/useWorkspaceSync.ts";
import {
  deleteSharedWorkspace,
  fetchSharedWorkspace,
  listSharedWorkspaces,
} from "../hooks/useWorkspaceSync.ts";
import { useAppSelector } from "../store/hooks.ts";

interface Props {
  onClose: () => void;
  onClone: (name: string, model: IJsonModel) => void;
}

function relativeTime(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SharedWorkspaceBrowser({ onClose, onClone }: Props) {
  const [entries, setEntries] = useState<SharedWorkspaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const userId = useAppSelector((s) => s.auth.user?.id ?? "");
  const userRole = useAppSelector((s) => s.auth.user?.role);

  useEffect(() => {
    listSharedWorkspaces()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  async function handleClone(entry: SharedWorkspaceEntry) {
    setCloningId(entry.id);
    const detail = await fetchSharedWorkspace(entry.id);
    setCloningId(null);
    if (!detail) return;
    onClone(detail.name, detail.model);
  }

  async function handleDelete(id: string) {
    await deleteSharedWorkspace(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop dismiss on click
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop — keyboard handled by ESC on inner dialog
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <span className="text-sm font-semibold text-gray-200">Shared Workspaces</span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-600 text-sm">
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-600 text-sm">
              <span className="text-2xl">⊞</span>
              <span>No shared workspaces yet.</span>
              <span className="text-[11px] text-gray-700">
                Share a workspace using the ↑ icon in the sidebar.
              </span>
            </div>
          ) : (
            <ul className="divide-y divide-gray-800 list-none m-0 p-0">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-400">
                    {entry.ownerEmoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-gray-200 truncate">
                      {entry.name}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {entry.ownerName} · {relativeTime(entry.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={cloningId === entry.id}
                      onClick={() => handleClone(entry)}
                      className="text-[11px] px-2.5 py-1 rounded bg-emerald-800 hover:bg-emerald-700 text-emerald-200 transition-colors disabled:opacity-50"
                    >
                      {cloningId === entry.id ? "Cloning…" : "Clone"}
                    </button>
                    {(entry.ownerId === userId || userRole === "admin") && (
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        title="Remove from shared registry"
                        className="text-[11px] px-2 py-1 rounded text-gray-600 hover:text-red-400 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
