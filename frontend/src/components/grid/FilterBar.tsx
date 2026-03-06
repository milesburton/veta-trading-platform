import { useSignal } from "@preact/signals-react";
import type { GridId } from "../../store/gridPrefsSlice.ts";
import { saveGridPrefs, setFilters } from "../../store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import type { FieldDef, FilterCriteria, FilterOp } from "../../types/gridPrefs.ts";
import { FilterEditor } from "./FilterEditor.tsx";

const OP_SHORT: Record<FilterOp, string> = {
  "=": "=",
  "!=": "≠",
  ">": ">",
  "<": "<",
  ">=": "≥",
  "<=": "≤",
  contains: "~",
  between: "↔",
  in: "∈",
};

function formatValue(filter: FilterCriteria): string {
  if (filter.op === "between") {
    const [lo, hi] = filter.value as [number, number];
    return `${lo}–${hi}`;
  }
  if (filter.op === "in") {
    const arr = filter.value as string[];
    return arr.length <= 2 ? arr.join(", ") : `${arr.slice(0, 2).join(", ")} +${arr.length - 2}`;
  }
  return String(filter.value);
}

interface Props {
  gridId: GridId;
  fields: FieldDef[];
}

export function FilterBar({ gridId, fields }: Props) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.gridPrefs[gridId].filters);
  const showEditor = useSignal(false);
  const editingFilter = useSignal<FilterCriteria | null>(null);

  function removeFilter(id: string) {
    dispatch(setFilters({ gridId, filters: filters.filter((f) => f.id !== id) }));
    dispatch(saveGridPrefs());
  }

  function openAdd() {
    editingFilter.value = null;
    showEditor.value = true;
  }

  function openEdit(filter: FilterCriteria) {
    editingFilter.value = filter;
    showEditor.value = true;
  }

  const fieldLabel = (key: string) => fields.find((f) => f.key === key)?.label ?? key;

  return (
    <>
      <div className="flex items-center gap-1 flex-wrap px-2 py-1 border-b border-gray-800/60 min-h-[28px]">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className="inline-flex items-center gap-1 bg-sky-900/40 border border-sky-700/50 rounded px-1.5 py-0.5 text-[10px] text-sky-300 cursor-pointer hover:bg-sky-900/60 transition-colors"
            onClick={() => openEdit(filter)}
            title="Click to edit this filter"
          >
            <span className="text-sky-500 font-mono">{fieldLabel(filter.field)}</span>
            <span className="text-sky-600">{OP_SHORT[filter.op]}</span>
            <span className="font-mono">{formatValue(filter)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeFilter(filter.id);
              }}
              className="text-sky-600 hover:text-sky-300 ml-0.5 leading-none"
              aria-label={`Remove filter ${fieldLabel(filter.field)} ${OP_SHORT[filter.op]} ${formatValue(filter)}`}
            >
              ×
            </button>
          </button>
        ))}
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-0.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors px-1 py-0.5 rounded hover:bg-gray-800"
          aria-label="Add filter"
        >
          <span>+</span>
          <span>Filter</span>
        </button>
        {filters.length > 0 && (
          <button
            type="button"
            onClick={() => {
              dispatch(setFilters({ gridId, filters: [] }));
              dispatch(saveGridPrefs());
            }}
            className="text-[10px] text-gray-700 hover:text-gray-500 ml-auto transition-colors"
            aria-label="Clear all filters"
          >
            Clear all
          </button>
        )}
      </div>

      {showEditor.value && (
        <FilterEditor
          gridId={gridId}
          fields={fields}
          editing={editingFilter.value}
          onClose={() => {
            showEditor.value = false;
          }}
        />
      )}
    </>
  );
}
