import { useState } from "react";
import {
  type NewsSource,
  useCreateNewsSourceMutation,
  useDeleteNewsSourceMutation,
  useGetNewsSourcesQuery,
  useToggleNewsSourceMutation,
  useUpdateNewsSourceMutation,
} from "../store/newsApi.ts";

interface SourceFormProps {
  initial?: NewsSource;
  onCancel: () => void;
  onSave: (values: { label: string; rssTemplate: string; symbolSpecific: boolean }) => void;
  saving: boolean;
}

function SourceForm({ initial, onCancel, onSave, saving }: SourceFormProps) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [rssTemplate, setRssTemplate] = useState(initial?.rssTemplate ?? "");
  const [symbolSpecific, setSymbolSpecific] = useState(initial?.symbolSpecific ?? false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !rssTemplate.trim()) return;
    onSave({
      label: label.trim(),
      rssTemplate: rssTemplate.trim(),
      symbolSpecific,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 p-3 bg-gray-900/80 rounded-lg border border-gray-700"
    >
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
        {initial ? "Edit Source" : "Add Source"}
      </p>
      <input
        type="text"
        placeholder="Label (e.g. Reuters)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        required
        className="w-full bg-gray-800 border border-gray-700 focus:border-gray-500 outline-none rounded px-2 py-1 text-[11px] text-gray-200 placeholder-gray-600"
      />
      <input
        type="text"
        placeholder="RSS URL (use {symbol} for symbol-specific)"
        value={rssTemplate}
        onChange={(e) => setRssTemplate(e.target.value)}
        required
        className="w-full bg-gray-800 border border-gray-700 focus:border-gray-500 outline-none rounded px-2 py-1 text-[11px] text-gray-200 placeholder-gray-600"
      />
      <label className="flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={symbolSpecific}
          onChange={(e) => setSymbolSpecific(e.target.checked)}
          className="accent-emerald-500"
        />
        Symbol-specific (URL contains <code className="text-emerald-400">{"{symbol}"}</code>)
      </label>
      <div className="flex gap-2 justify-end mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !label.trim() || !rssTemplate.trim()}
          className="text-[10px] text-emerald-400 border border-emerald-700/50 hover:bg-emerald-900/20 px-2 py-1 rounded transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : initial ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

export function NewsSourcesPanel() {
  const { data: sources = [], isLoading, isError, refetch } = useGetNewsSourcesQuery();
  const [toggleSource, { isLoading: toggling, originalArgs: togglingId }] =
    useToggleNewsSourceMutation();
  const [createSource, { isLoading: creating }] = useCreateNewsSourceMutation();
  const [updateSource, { isLoading: updating }] = useUpdateNewsSourceMutation();
  const [deleteSource] = useDeleteNewsSourceMutation();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleCreate(values: {
    label: string;
    rssTemplate: string;
    symbolSpecific: boolean;
  }) {
    await createSource({ ...values, enabled: true });
    setShowAddForm(false);
  }

  async function handleUpdate(
    id: string,
    values: { label: string; rssTemplate: string; symbolSpecific: boolean }
  ) {
    await updateSource({ id, ...values });
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    await deleteSource(id);
    setConfirmDeleteId(null);
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-300">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          News Sources
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setShowAddForm((v) => !v);
              setEditingId(null);
            }}
            title="Add news source"
            aria-label="Add news source"
            className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors px-1.5 py-0.5 rounded border border-emerald-700/50 hover:border-emerald-600"
          >
            + Add
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            title="Refresh news source list"
            aria-label="Refresh news sources"
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40 px-1 py-0.5 rounded border border-gray-700 hover:border-gray-500"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        {showAddForm && (
          <SourceForm
            onCancel={() => setShowAddForm(false)}
            onSave={handleCreate}
            saving={creating}
          />
        )}

        {isLoading && (
          <div className="flex items-center justify-center flex-1">
            <span className="text-[11px] text-gray-600">Loading sources…</span>
          </div>
        )}

        {!isLoading && isError && (
          <div className="flex flex-col items-center justify-center gap-2 flex-1 px-4 text-center">
            <span className="text-[11px] text-red-400/70">
              Could not reach news-aggregator service
            </span>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-[10px] text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-2 py-0.5 rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && sources.length === 0 && !showAddForm && (
          <div className="flex items-center justify-center flex-1">
            <span className="text-[11px] text-gray-600">
              No sources configured. Click + Add to create one.
            </span>
          </div>
        )}

        {!isLoading &&
          !isError &&
          sources.map((source) => (
            <div key={source.id}>
              {editingId === source.id ? (
                <SourceForm
                  initial={source}
                  onCancel={() => setEditingId(null)}
                  onSave={(v) => handleUpdate(source.id, v)}
                  saving={updating}
                />
              ) : confirmDeleteId === source.id ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-900/20 border border-red-700/40">
                  <span className="flex-1 text-[11px] text-gray-300">
                    Delete &ldquo;{source.label}&rdquo;?
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded border border-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(source.id)}
                    className="text-[10px] text-red-400 hover:text-red-300 border border-red-700/50 hover:bg-red-900/20 px-2 py-0.5 rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900/60 border border-gray-800 group">
                  {/* Status dot */}
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      source.enabled ? "bg-emerald-400" : "bg-gray-600"
                    }`}
                  />

                  {/* Source info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-gray-200 truncate">
                        {source.label}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono border shrink-0 ${
                          source.symbolSpecific
                            ? "text-blue-400 border-blue-700/40 bg-blue-900/20"
                            : "text-gray-500 border-gray-700/40 bg-gray-800/40"
                        }`}
                      >
                        {source.symbolSpecific ? "symbol-specific" : "general"}
                      </span>
                    </div>
                    {source.rssTemplate && (
                      <span
                        className="text-[9px] text-gray-600 truncate block"
                        title={source.rssTemplate}
                      >
                        {source.rssTemplate}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(source.id);
                        setShowAddForm(false);
                      }}
                      title={`Edit ${source.label}`}
                      className="text-[10px] text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded border border-gray-700 hover:border-gray-500 transition-all"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(source.id)}
                      title={`Delete ${source.label}`}
                      className="text-[10px] text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded border border-gray-700 hover:border-red-700/50 transition-all"
                    >
                      ✕
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSource(source.id)}
                      disabled={toggling && togglingId === source.id}
                      title={source.enabled ? `Disable ${source.label}` : `Enable ${source.label}`}
                      aria-pressed={source.enabled}
                      className={`text-[10px] px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${
                        source.enabled
                          ? "text-red-400 border-red-700/50 hover:bg-red-900/20 hover:border-red-600"
                          : "text-emerald-400 border-emerald-700/50 hover:bg-emerald-900/20 hover:border-emerald-600"
                      }`}
                    >
                      {toggling && togglingId === source.id
                        ? "…"
                        : source.enabled
                          ? "Disable"
                          : "Enable"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
