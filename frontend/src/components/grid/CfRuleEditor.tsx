import { useSignal } from "@preact/signals-react";
import { v4 as uuidv4 } from "uuid";
import type { GridId } from "../../store/gridPrefsSlice.ts";
import { saveGridPrefs, setCfRules } from "../../store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import type {
  CfStyle,
  ColDef,
  ConditionalFormatRule,
  ExprGroup,
  FieldDef,
} from "../../types/gridPrefs.ts";
import { EMPTY_EXPR_GROUP } from "../../types/gridPrefs.ts";
import { ExpressionBuilderInline } from "./ExpressionBuilder.tsx";

const BG_PRESETS: { label: string; tw: string }[] = [
  { label: "Amber", tw: "bg-amber-900/40" },
  { label: "Red", tw: "bg-red-900/40" },
  { label: "Green", tw: "bg-emerald-900/40" },
  { label: "Sky", tw: "bg-sky-900/40" },
  { label: "Purple", tw: "bg-purple-900/40" },
  { label: "Gray", tw: "bg-gray-800/60" },
  { label: "Yellow", tw: "bg-yellow-900/40" },
  { label: "None", tw: "" },
];

const TEXT_PRESETS: { label: string; tw: string }[] = [
  { label: "Amber", tw: "text-amber-400" },
  { label: "Red", tw: "text-red-400" },
  { label: "Green", tw: "text-emerald-400" },
  { label: "Sky", tw: "text-sky-400" },
  { label: "Gray", tw: "text-gray-500" },
  { label: "White", tw: "text-gray-100" },
  { label: "Yellow", tw: "text-yellow-400" },
  { label: "Default", tw: "" },
];

const BORDER_PRESETS: { label: string; tw: string }[] = [
  { label: "Amber L", tw: "border-l-2 border-l-amber-500" },
  { label: "Red L", tw: "border-l-2 border-l-red-500" },
  { label: "Green L", tw: "border-l-2 border-l-emerald-500" },
  { label: "Sky L", tw: "border-l-2 border-l-sky-500" },
  { label: "None", tw: "" },
];

function RuleSwatch({ style }: { style: CfStyle }) {
  const classes = [style.bg, style.textColor, style.bold ? "font-bold" : "", style.border]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={`inline-flex w-16 h-4 rounded border border-gray-700 text-[9px] items-center justify-center ${classes}`}
    >
      Sample
    </span>
  );
}

interface RuleFormProps {
  rule: Partial<ConditionalFormatRule>;
  fields: FieldDef[];
  onChange: (r: Partial<ConditionalFormatRule>) => void;
}

function RuleForm({ rule, fields, onChange }: RuleFormProps) {
  const style = rule.style ?? {};
  const expr: ExprGroup = rule.expr ?? { ...EMPTY_EXPR_GROUP, id: uuidv4(), rules: [] };

  function updateStyle(patch: Partial<CfStyle>) {
    onChange({ ...rule, style: { ...style, ...patch } });
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex gap-2">
        {(["row", "cell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange({ ...rule, scope: s })}
            className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${
              rule.scope === s
                ? "bg-sky-700 border-sky-600 text-white"
                : "border-gray-700 text-gray-500 hover:text-gray-300"
            }`}
          >
            {s === "row" ? "Entire row" : "Cell only"}
          </button>
        ))}
      </div>

      <div>
        <div className="block text-[10px] text-gray-500 mb-1">Label (optional)</div>
        <input
          type="text"
          value={rule.label ?? ""}
          onChange={(e) => onChange({ ...rule, label: e.target.value })}
          placeholder="e.g. Large orders"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-sky-500"
        />
      </div>

      {rule.scope === "cell" && (
        <div>
          <div className="block text-[10px] text-gray-500 mb-1">Cell field to highlight</div>
          <select
            value={rule.cellField ?? fields[0]?.key}
            onChange={(e) => onChange({ ...rule, cellField: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-sky-500"
          >
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <div className="block text-[10px] text-gray-500 mb-1">Condition</div>
        <ExpressionBuilderInline
          fields={fields}
          value={expr}
          onChange={(updated) => onChange({ ...rule, expr: updated })}
        />
      </div>

      <div>
        <div className="text-[10px] text-gray-500 mb-1">Background</div>
        <div className="flex flex-wrap gap-1">
          {BG_PRESETS.map((p) => (
            <button
              key={p.tw}
              type="button"
              title={p.label}
              onClick={() => updateStyle({ bg: p.tw || undefined })}
              className={`w-6 h-4 rounded border ${p.tw || "bg-gray-900"} ${
                style.bg === p.tw || (!style.bg && !p.tw)
                  ? "border-sky-500 ring-1 ring-sky-500"
                  : "border-gray-600"
              }`}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-gray-500 mb-1">Text colour</div>
        <div className="flex flex-wrap gap-1">
          {TEXT_PRESETS.map((p) => (
            <button
              key={p.tw}
              type="button"
              title={p.label}
              onClick={() => updateStyle({ textColor: p.tw || undefined })}
              className={`px-1.5 py-0.5 rounded border text-[9px] ${p.tw || "text-gray-400"} ${
                style.textColor === p.tw || (!style.textColor && !p.tw)
                  ? "border-sky-500"
                  : "border-gray-700"
              }`}
            >
              Aa
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div>
          <div className="text-[10px] text-gray-500 mb-1">Left border</div>
          <div className="flex flex-wrap gap-1">
            {BORDER_PRESETS.map((p) => (
              <button
                key={p.tw}
                type="button"
                title={p.label}
                onClick={() => updateStyle({ border: p.tw || undefined })}
                className={`px-1.5 py-0.5 rounded border text-[9px] text-gray-400 transition-colors ${
                  style.border === p.tw || (!style.border && !p.tw)
                    ? "border-sky-500"
                    : "border-gray-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer mt-3">
          <input
            type="checkbox"
            checked={style.bold ?? false}
            onChange={(e) => updateStyle({ bold: e.target.checked || undefined })}
            className="accent-sky-500"
          />
          <span className="text-[10px] text-gray-400">Bold</span>
        </label>
      </div>

      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-gray-500">Preview:</span>
        <RuleSwatch style={style} />
      </div>
    </div>
  );
}

interface Props {
  gridId: GridId;
  fields: ColDef[] | FieldDef[];
  onClose: () => void;
}

export function CfRuleEditor({ gridId, fields, onClose }: Props) {
  const dispatch = useAppDispatch();
  const cfRules = useAppSelector((s) => s.gridPrefs[gridId].cfRules);
  const editingRule = useSignal<Partial<ConditionalFormatRule> | null>(null);

  function startNew() {
    editingRule.value = {
      id: uuidv4(),
      scope: "row",
      cellField: fields[0]?.key,
      expr: { kind: "group", id: uuidv4(), join: "AND", rules: [] },
      style: {},
    };
  }

  function startEdit(rule: ConditionalFormatRule) {
    editingRule.value = { ...rule };
  }

  function deleteRule(id: string) {
    const updated = cfRules.filter((r) => r.id !== id);
    dispatch(setCfRules({ gridId, rules: updated }));
    dispatch(saveGridPrefs());
  }

  function saveRule() {
    const r = editingRule.value;
    if (!r || !r.id || !r.scope || !r.expr) return;
    const complete = r as ConditionalFormatRule;
    const existing = cfRules.find((x) => x.id === r.id);
    const updated = existing
      ? cfRules.map((x) => (x.id === r.id ? complete : x))
      : [...cfRules, complete];
    dispatch(setCfRules({ gridId, rules: updated }));
    dispatch(saveGridPrefs());
    editingRule.value = null;
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-gray-950 border-l border-gray-800 shadow-2xl flex flex-col z-20 text-xs">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between shrink-0">
        <span className="text-gray-300 font-semibold text-[11px]">Conditional Formatting</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-600 hover:text-gray-400 text-base leading-none"
          aria-label="Close formatting editor"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {editingRule.value ? (
          <div className="p-3">
            <RuleForm
              rule={editingRule.value}
              fields={fields}
              onChange={(r) => {
                editingRule.value = r;
              }}
            />
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  editingRule.value = null;
                }}
                className="flex-1 py-1 border border-gray-700 rounded text-gray-500 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveRule}
                className="flex-1 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded transition-colors"
              >
                Save rule
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {cfRules.length === 0 && (
              <p className="text-gray-600 text-center py-4">No formatting rules yet.</p>
            )}
            {cfRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded p-2"
              >
                <RuleSwatch style={rule.style} />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-300 truncate">{rule.label || rule.scope}</div>
                  <div className="text-[10px] text-gray-600">
                    {rule.scope} · {rule.expr.rules.length} condition
                    {rule.expr.rules.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(rule)}
                  className="text-gray-600 hover:text-gray-300 px-1"
                  aria-label="Edit rule"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => deleteRule(rule.id)}
                  className="text-gray-700 hover:text-red-400 px-1"
                  aria-label="Delete rule"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!editingRule.value && (
        <div className="p-3 border-t border-gray-800 shrink-0">
          <button
            type="button"
            onClick={startNew}
            className="w-full py-1.5 border border-dashed border-gray-700 rounded text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors text-[11px]"
          >
            + Add rule
          </button>
        </div>
      )}
    </div>
  );
}
