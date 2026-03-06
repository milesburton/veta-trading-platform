import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { GridId } from "../../store/gridPrefsSlice.ts";
import { saveGridPrefs, setFilters } from "../../store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import type { FieldDef, FilterCriteria, FilterOp } from "../../types/gridPrefs.ts";

const OPS_BY_TYPE: Record<FieldDef["type"], FilterOp[]> = {
  string: ["=", "!=", "contains"],
  number: ["=", "!=", ">", "<", ">=", "<=", "between"],
  enum: ["=", "!=", "in"],
};

const OP_LABELS: Record<FilterOp, string> = {
  "=": "equals",
  "!=": "not equals",
  ">": "greater than",
  "<": "less than",
  ">=": "≥",
  "<=": "≤",
  contains: "contains",
  between: "between",
  in: "is one of",
};

interface Props {
  gridId: GridId;
  fields: FieldDef[];
  editing?: FilterCriteria | null;
  onClose: () => void;
}

export function FilterEditor({ gridId, fields, editing, onClose }: Props) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.gridPrefs[gridId].filters);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const selectedField = useSignal(editing?.field ?? fields[0]?.key ?? "");
  const selectedOp = useSignal<FilterOp>(editing?.op ?? "=");
  const valueStr = useSignal(
    editing
      ? Array.isArray(editing.value)
        ? (editing.value as string[]).join(", ")
        : String(editing.value)
      : ""
  );
  const betweenLo = useSignal(
    editing?.op === "between" ? String((editing.value as [number, number])[0]) : ""
  );
  const betweenHi = useSignal(
    editing?.op === "between" ? String((editing.value as [number, number])[1]) : ""
  );
  const selectedEnums = useSignal<string[]>(
    editing?.op === "in" ? (editing.value as string[]) : []
  );

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  const fieldDef = fields.find((f) => f.key === selectedField.value) ?? fields[0];
  const availableOps = OPS_BY_TYPE[fieldDef?.type ?? "string"];

  // Reset op if it's not valid for the new field type
  if (!availableOps.includes(selectedOp.value)) {
    selectedOp.value = availableOps[0];
  }

  function buildValue(): FilterCriteria["value"] {
    if (selectedOp.value === "between") {
      return [Number(betweenLo.value) || 0, Number(betweenHi.value) || 0];
    }
    if (selectedOp.value === "in") {
      return selectedEnums.value;
    }
    if (fieldDef?.type === "number") {
      return Number(valueStr.value) || 0;
    }
    return valueStr.value;
  }

  function handleSave() {
    const value = buildValue();
    const updated = editing
      ? filters.map((f) =>
          f.id === editing.id
            ? { ...f, field: selectedField.value, op: selectedOp.value, value }
            : f
        )
      : [...filters, { id: uuidv4(), field: selectedField.value, op: selectedOp.value, value }];

    dispatch(setFilters({ gridId, filters: updated }));
    dispatch(saveGridPrefs());
    onClose();
  }

  function toggleEnum(opt: string) {
    const cur = selectedEnums.value;
    selectedEnums.value = cur.includes(opt) ? cur.filter((v) => v !== opt) : [...cur, opt];
  }

  return (
    <dialog
      ref={dialogRef}
      className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-4 w-80 text-xs text-gray-200 backdrop:bg-black/60"
      onClose={onClose}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-gray-300">
          {editing ? "Edit filter" : "Add filter"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-600 hover:text-gray-400 text-base leading-none"
          aria-label="Close filter editor"
        >
          ×
        </button>
      </div>

      {/* Field picker */}
      <div className="mb-2">
        <label htmlFor="filter-field" className="block text-[10px] text-gray-500 mb-1">
          Field
        </label>
        <select
          id="filter-field"
          value={selectedField.value}
          onChange={(e) => {
            selectedField.value = e.target.value;
            selectedEnums.value = [];
            valueStr.value = "";
          }}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-sky-500"
        >
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* Operator picker */}
      <div className="mb-2">
        <label htmlFor="filter-op" className="block text-[10px] text-gray-500 mb-1">
          Operator
        </label>
        <select
          id="filter-op"
          value={selectedOp.value}
          onChange={(e) => {
            selectedOp.value = e.target.value as FilterOp;
            selectedEnums.value = [];
          }}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-sky-500"
        >
          {availableOps.map((op) => (
            <option key={op} value={op}>
              {OP_LABELS[op]}
            </option>
          ))}
        </select>
      </div>

      {/* Value input */}
      <div className="mb-4">
        <div className="block text-[10px] text-gray-500 mb-1">Value</div>

        {selectedOp.value === "between" ? (
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="From"
              value={betweenLo.value}
              onChange={(e) => {
                betweenLo.value = e.target.value;
              }}
              className="w-1/2 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-sky-500 tabular-nums"
            />
            <input
              type="number"
              placeholder="To"
              value={betweenHi.value}
              onChange={(e) => {
                betweenHi.value = e.target.value;
              }}
              className="w-1/2 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-sky-500 tabular-nums"
            />
          </div>
        ) : selectedOp.value === "in" && fieldDef?.options ? (
          <div className="space-y-1 max-h-36 overflow-y-auto border border-gray-700 rounded p-2 bg-gray-800">
            {fieldDef.options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 cursor-pointer hover:text-gray-100"
              >
                <input
                  type="checkbox"
                  checked={selectedEnums.value.includes(opt)}
                  onChange={() => toggleEnum(opt)}
                  className="accent-sky-500"
                />
                {opt}
              </label>
            ))}
          </div>
        ) : (
          <input
            type={fieldDef?.type === "number" ? "number" : "text"}
            value={valueStr.value}
            onChange={(e) => {
              valueStr.value = e.target.value;
            }}
            placeholder={fieldDef?.type === "number" ? "0" : "value…"}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-sky-500 tabular-nums"
          />
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-3 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded transition-colors"
        >
          {editing ? "Update" : "Add filter"}
        </button>
      </div>
    </dialog>
  );
}
