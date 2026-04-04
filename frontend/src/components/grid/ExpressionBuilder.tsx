import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { GridId } from "../../store/gridPrefsSlice.ts";
import { saveGridPrefs, setFilterExpr } from "../../store/gridPrefsSlice.ts";
import { useAppDispatch } from "../../store/hooks.ts";
import type {
  ExprGroup,
  ExprJoin,
  ExprNode,
  ExprOp,
  ExprRule,
  FieldDef,
} from "../../types/gridPrefs.ts";
import { EMPTY_EXPR_GROUP } from "../../types/gridPrefs.ts";

const OPS_BY_TYPE: Record<FieldDef["type"], ExprOp[]> = {
  string: ["=", "!=", "contains", "starts_with", "ends_with", "is_null", "is_not_null"],
  number: ["=", "!=", ">", "<", ">=", "<=", "between", "is_null", "is_not_null"],
  enum: ["=", "!=", "in", "is_null", "is_not_null"],
};

const OP_LABELS: Record<ExprOp, string> = {
  "=": "equals",
  "!=": "not equals",
  ">": "greater than",
  "<": "less than",
  ">=": "≥",
  "<=": "≤",
  contains: "contains",
  starts_with: "starts with",
  ends_with: "ends with",
  between: "between",
  in: "is one of",
  is_null: "IS NULL",
  is_not_null: "IS NOT NULL",
};

const NO_VALUE_OPS: ExprOp[] = ["is_null", "is_not_null"];

function makeRule(fields: FieldDef[]): ExprRule {
  const field = fields[0]?.key ?? "";
  const type = fields[0]?.type ?? "string";
  return {
    kind: "rule",
    id: uuidv4(),
    field,
    op: OPS_BY_TYPE[type][0],
    value: "",
  };
}

function makeGroup(join: ExprJoin = "AND"): ExprGroup {
  return { kind: "group", id: uuidv4(), join, rules: [] };
}

function patchNode(group: ExprGroup, id: string, updater: (n: ExprNode) => ExprNode): ExprGroup {
  return {
    ...group,
    rules: group.rules.map((n) => {
      if (n.id === id) return updater(n);
      if (n.kind === "group") return patchNode(n, id, updater);
      return n;
    }),
  };
}

function removeNode(group: ExprGroup, id: string): ExprGroup {
  return {
    ...group,
    rules: group.rules
      .filter((n) => n.id !== id)
      .map((n) => (n.kind === "group" ? removeNode(n, id) : n)),
  };
}

interface RuleNodeProps {
  rule: ExprRule;
  fields: FieldDef[];
  onChange: (updated: ExprRule) => void;
  onDelete: () => void;
}

function RuleNode({ rule, fields, onChange, onDelete }: RuleNodeProps) {
  const fieldDef = fields.find((f) => f.key === rule.field) ?? fields[0];
  const availableOps = OPS_BY_TYPE[fieldDef?.type ?? "string"];
  const noValue = NO_VALUE_OPS.includes(rule.op);

  function handleFieldChange(key: string) {
    const def = fields.find((f) => f.key === key) ?? fields[0];
    const ops = OPS_BY_TYPE[def.type];
    onChange({ ...rule, field: key, op: ops[0], value: "" });
  }

  function handleOpChange(op: ExprOp) {
    onChange({
      ...rule,
      op,
      value: NO_VALUE_OPS.includes(op) ? "" : rule.value,
    });
  }

  return (
    <div className="flex items-start gap-1.5 flex-wrap">
      {/* Field */}
      <select
        value={rule.field}
        onChange={(e) => handleFieldChange(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-sky-500"
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Operator */}
      <select
        value={rule.op}
        onChange={(e) => handleOpChange(e.target.value as ExprOp)}
        className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-sky-500"
      >
        {availableOps.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>

      {/* Value input — hidden for is_null / is_not_null */}
      {!noValue &&
        (rule.op === "between" ? (
          <div className="flex gap-1">
            <input
              type="number"
              placeholder="From"
              value={Array.isArray(rule.value) ? String((rule.value as [number, number])[0]) : ""}
              onChange={(e) => {
                const hi = Array.isArray(rule.value) ? (rule.value as [number, number])[1] : 0;
                onChange({
                  ...rule,
                  value: [Number(e.target.value) || 0, hi],
                });
              }}
              className="w-20 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-sky-500 tabular-nums"
            />
            <input
              type="number"
              placeholder="To"
              value={Array.isArray(rule.value) ? String((rule.value as [number, number])[1]) : ""}
              onChange={(e) => {
                const lo = Array.isArray(rule.value) ? (rule.value as [number, number])[0] : 0;
                onChange({
                  ...rule,
                  value: [lo, Number(e.target.value) || 0],
                });
              }}
              className="w-20 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-sky-500 tabular-nums"
            />
          </div>
        ) : rule.op === "in" && fieldDef?.options ? (
          <div className="flex flex-wrap gap-1">
            {fieldDef.options.map((opt) => {
              const selected = Array.isArray(rule.value) && (rule.value as string[]).includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const cur = Array.isArray(rule.value) ? (rule.value as string[]) : [];
                    onChange({
                      ...rule,
                      value: selected ? cur.filter((v) => v !== opt) : [...cur, opt],
                    });
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                    selected
                      ? "bg-sky-700 border-sky-600 text-white"
                      : "border-gray-700 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        ) : (
          <input
            type={fieldDef?.type === "number" ? "number" : "text"}
            value={Array.isArray(rule.value) ? "" : String(rule.value ?? "")}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({
                ...rule,
                value: fieldDef?.type === "number" ? Number(raw) || 0 : raw,
              });
            }}
            placeholder="value…"
            className="w-28 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-sky-500 tabular-nums"
          />
        ))}

      {/* Delete rule */}
      <button
        type="button"
        onClick={onDelete}
        className="text-gray-700 hover:text-red-400 px-1 text-base leading-none mt-0.5"
        aria-label="Remove rule"
      >
        ×
      </button>
    </div>
  );
}

interface GroupNodeProps {
  group: ExprGroup;
  fields: FieldDef[];
  onChange: (updated: ExprGroup) => void;
  onDelete?: () => void;
  depth: number;
}

function GroupNode({ group, fields, onChange, onDelete, depth }: GroupNodeProps) {
  const borderColor = depth === 0 ? "border-gray-800" : "border-sky-900/60";
  const bgColor = depth === 0 ? "" : "bg-sky-950/20";

  function handleRuleChange(id: string, updated: ExprRule) {
    onChange(patchNode(group, id, () => updated) as ExprGroup);
  }

  function handleGroupChange(id: string, updated: ExprGroup) {
    onChange(patchNode(group, id, () => updated) as ExprGroup);
  }

  function handleDelete(id: string) {
    onChange(removeNode(group, id));
  }

  function addRule() {
    onChange({ ...group, rules: [...group.rules, makeRule(fields)] });
  }

  function addSubGroup() {
    onChange({ ...group, rules: [...group.rules, makeGroup("OR")] });
  }

  function toggleJoin() {
    onChange({ ...group, join: group.join === "AND" ? "OR" : "AND" });
  }

  return (
    <div className={`border rounded p-2 space-y-2 ${borderColor} ${bgColor}`}>
      {/* Join toggle — shown between items, or as a pill at the top */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleJoin}
          className="px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
          title="Click to toggle AND / OR"
        >
          {group.join}
        </button>
        <span className="text-[10px] text-gray-600">
          {group.join === "AND" ? "all must match" : "any must match"}
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto text-gray-700 hover:text-red-400 px-1 text-base leading-none"
            aria-label="Remove group"
          >
            ×
          </button>
        )}
      </div>

      {/* Rules */}
      {group.rules.map((node) => (
        <div key={node.id}>
          {node.kind === "rule" ? (
            <RuleNode
              rule={node}
              fields={fields}
              onChange={(updated) => handleRuleChange(node.id, updated)}
              onDelete={() => handleDelete(node.id)}
            />
          ) : (
            <GroupNode
              group={node}
              fields={fields}
              onChange={(updated) => handleGroupChange(node.id, updated)}
              onDelete={() => handleDelete(node.id)}
              depth={depth + 1}
            />
          )}
        </div>
      ))}

      {/* Add buttons */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={addRule}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          + Add rule
        </button>
        {depth < 2 && (
          <button
            type="button"
            onClick={addSubGroup}
            className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
          >
            + Add group
          </button>
        )}
      </div>
    </div>
  );
}

interface InlineProps {
  fields: FieldDef[];
  value: ExprGroup;
  onChange: (expr: ExprGroup) => void;
}

export function ExpressionBuilderInline({ fields, value, onChange }: InlineProps) {
  return (
    <div className="border border-gray-800 rounded p-2">
      <GroupNode group={value} fields={fields} onChange={onChange} depth={0} />
    </div>
  );
}

interface Props {
  gridId: GridId;
  fields: FieldDef[];
  /** Pre-populate with an existing expression (e.g. when editing). */
  initial?: ExprGroup;
  /** Optionally pre-select a field on first open (e.g. from header ctx menu). */
  initialField?: string;
  onClose: () => void;
}

export function ExpressionBuilder({ gridId, fields, initial, initialField, onClose }: Props) {
  const dispatch = useAppDispatch();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Build starting state: use provided initial, or seed with one rule for initialField
  const startExpr: ExprGroup = (() => {
    if (initial && initial.rules.length > 0) return initial;
    if (initialField) {
      const rule = makeRule(fields);
      return {
        ...EMPTY_EXPR_GROUP,
        id: uuidv4(),
        rules: [{ ...rule, field: initialField }],
      };
    }
    return { ...EMPTY_EXPR_GROUP, id: uuidv4(), rules: [makeRule(fields)] };
  })();

  const expr = useSignal<ExprGroup>(startExpr);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    el.showModal();
    // Handle Escape key via the cancel event (fires before close)
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => {
      el.removeEventListener("cancel", onCancel);
      // Close without triggering the onClose callback (component is unmounting)
      if (!el.open) return;
      el.close();
    };
  }, [onClose]);

  function handleApply() {
    dispatch(setFilterExpr({ gridId, expr: expr.value }));
    dispatch(saveGridPrefs());
    onClose();
  }

  function handleClear() {
    dispatch(
      setFilterExpr({
        gridId,
        expr: { ...EMPTY_EXPR_GROUP, id: uuidv4(), rules: [] },
      })
    );
    dispatch(saveGridPrefs());
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-0 w-[520px] max-w-[95vw] text-xs text-gray-200 backdrop:bg-black/60"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
        <span className="font-semibold text-[11px] text-gray-300">Build Filter</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-600 hover:text-gray-400 text-base leading-none"
          aria-label="Close filter builder"
        >
          ×
        </button>
      </div>

      {/* Builder */}
      <div className="p-4 max-h-[60vh] overflow-y-auto">
        <GroupNode
          group={expr.value}
          fields={fields}
          onChange={(updated) => {
            expr.value = updated;
          }}
          depth={0}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-800">
        <button
          type="button"
          onClick={handleClear}
          className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
        >
          Clear all
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-gray-500 hover:text-gray-300 transition-colors text-[11px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-3 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded transition-colors text-[11px]"
          >
            Apply
          </button>
        </div>
      </div>
    </dialog>
  );
}
