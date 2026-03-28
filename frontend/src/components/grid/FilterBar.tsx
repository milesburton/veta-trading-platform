import { useSignal } from "@preact/signals-react";
import type { GridId } from "../../store/gridPrefsSlice.ts";
import { saveGridPrefs, setFilterExpr } from "../../store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import type { ExprGroup, FieldDef } from "../../types/gridPrefs.ts";
import { EMPTY_EXPR_GROUP } from "../../types/gridPrefs.ts";
import { exprGroupToDisplay } from "../../utils/gridFilter.ts";
import { ExpressionBuilder } from "./ExpressionBuilder.tsx";

interface Props {
  gridId: GridId;
  fields: FieldDef[];
  /** Optional: open the builder pre-selecting a specific field (e.g. from header context menu). */
  openFieldSignal?: { value: string | null };
}

export function FilterBar({ gridId, fields, openFieldSignal }: Props) {
  const dispatch = useAppDispatch();
  const filterExpr = useAppSelector((s) => s.gridPrefs[gridId].filterExpr ?? EMPTY_EXPR_GROUP);
  const showBuilder = useSignal(false);

  const hasRules = filterExpr.rules.length > 0;
  const summary = hasRules ? exprGroupToDisplay(filterExpr, fields) : "";

  function openBuilder() {
    showBuilder.value = true;
  }

  function clearExpr() {
    dispatch(setFilterExpr({ gridId, expr: { ...EMPTY_EXPR_GROUP, rules: [] } }));
    dispatch(saveGridPrefs());
  }

  function handleBuilderClose() {
    showBuilder.value = false;
    if (openFieldSignal) openFieldSignal.value = null;
  }

  const pendingField = openFieldSignal?.value ?? null;
  if (pendingField && !showBuilder.value) {
    showBuilder.value = true;
  }

  const initial: ExprGroup | undefined = hasRules ? filterExpr : undefined;

  return (
    <>
      <div className="flex items-center gap-1 flex-wrap px-2 py-1 border-b border-gray-800/60 min-h-[28px]">
        {hasRules ? (
          <button
            type="button"
            onClick={openBuilder}
            className="inline-flex items-center gap-1 bg-sky-900/40 border border-sky-700/50 rounded px-2 py-0.5 text-[10px] text-sky-300 hover:bg-sky-900/60 transition-colors max-w-xs"
            title="Click to edit filter expression"
          >
            <span className="font-mono truncate">{summary}</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={openBuilder}
          className="inline-flex items-center gap-0.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors px-1 py-0.5 rounded hover:bg-gray-800"
          aria-label="Add filter"
        >
          <span>+</span>
          <span>Filter</span>
        </button>

        {hasRules && (
          <button
            type="button"
            onClick={clearExpr}
            className="text-[10px] text-gray-700 hover:text-gray-500 ml-auto transition-colors"
            aria-label="Clear all filters"
          >
            Clear all
          </button>
        )}
      </div>

      {showBuilder.value && (
        <ExpressionBuilder
          gridId={gridId}
          fields={fields}
          initial={initial}
          initialField={pendingField ?? undefined}
          onClose={handleBuilderClose}
        />
      )}
    </>
  );
}
