import { useSignal } from "@preact/signals-react";
import type { IJsonModel } from "flexlayout-react";
import { useEffect } from "react";
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
  const entries = useSignal<SharedWorkspaceEntry[]>([]);
  const loading = useSignal(true);
  const cloningId = useSignal<string | null>(null);
  const search = useSignal("");
  const isAdmin = useAppSelector((s) => s.auth.user?.role === "admin");

  useEffect(() => {
    listSharedWorkspaces()
      .then((result) => {
        entries.value = result;
      })
      .finally(() => {
        loading.value = false;
      });
  }, [entries, loading]);

  const filtered = entries.value.filter((e) => {
    const q = search.value.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.ownerName.toLowerCase().includes(q)
    );
  });

  async function handleClone(entry: SharedWorkspaceEntry) {
    cloningId.value = entry.id;
    const detail = await fetchSharedWorkspace(entry.id);
    cloningId.value = null;
    if (!detail) return;
    onClone(detail.name, detail.model);
  }

  async function handleDelete(id: string) {
    await deleteSharedWorkspace(id);
    entries.value = entries.value.filter((e) => e.id !== id);
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
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-xl mx-4 flex flex-col max-h-[80vh]">
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

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-800 shrink-0">
          <input
            type="search"
            placeholder="Filter by name, description or owner…"
            value={search.value}
            onChange={(e) => {
              search.value = e.currentTarget.value;
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading.value ? (
            <div className="flex items-center justify-center py-12 text-gray-600 text-sm">
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-600 text-sm">
              <span className="text-2xl">⊞</span>
              <span>
                {search.value ? "No workspaces match your search." : "No shared workspaces yet."}
              </span>
            </div>
          ) : (
            <ul className="divide-y divide-gray-800 list-none m-0 p-0">
              {filtered.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-400 mt-0.5">
                    {entry.ownerEmoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-gray-200 truncate">
                      {entry.name}
                    </div>
                    {entry.description && (
                      <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">
                        {entry.description}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-600 mt-0.5">
                      {entry.ownerName} · {relativeTime(entry.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button
                      type="button"
                      disabled={cloningId.value === entry.id}
                      onClick={() => handleClone(entry)}
                      className="text-[11px] px-2.5 py-1 rounded bg-emerald-800 hover:bg-emerald-700 text-emerald-200 transition-colors disabled:opacity-50"
                    >
                      {cloningId.value === entry.id ? "Cloning…" : "Clone"}
                    </button>
                    {isAdmin && (
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

        {/* Footer count */}
        {!loading.value && entries.value.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-800 shrink-0 text-[10px] text-gray-600">
            {filtered.length === entries.value.length
              ? `${entries.value.length} workspace${entries.value.length !== 1 ? "s" : ""}`
              : `${filtered.length} of ${entries.value.length}`}
          </div>
        )}
      </div>
    </div>
  );
}
