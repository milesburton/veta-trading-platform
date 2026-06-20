import type { GridId } from "@veta/frontend/store/gridPrefsSlice.ts";
import {
  saveGridPrefs,
  setColumnOrder,
  setColumnWidth,
  toggleFrozenColumn,
} from "@veta/frontend/store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import type { ColDef } from "@veta/frontend/types/gridPrefs.ts";
import { useMemo } from "react";

export function useColumnLayout(
  gridId: GridId,
  cols: ColDef[]
): {
  orderedCols: ColDef[];
  frozenColumns: string[];
  getWidth: (key: string) => number;
  getStickyProps: (key: string) => { style: React.CSSProperties; isLastFrozen: boolean } | null;
  onResize: (key: string, width: number) => void;
  onReorder: (fromKey: string, toKey: string) => void;
  onToggleFreeze: (key: string) => void;
} {
  const dispatch = useAppDispatch();
  const { columnWidths, columnOrder, frozenColumns } = useAppSelector((s) => s.gridPrefs[gridId]);

  const orderedCols = useMemo(() => {
    if (!columnOrder || columnOrder.length === 0) return cols;
    const map = new Map(cols.map((c) => [c.key, c]));
    const ordered = columnOrder.flatMap((key) => {
      const col = map.get(key);
      return col ? [col] : [];
    });
    const seen = new Set(columnOrder);
    for (const col of cols) {
      if (!seen.has(col.key)) ordered.push(col);
    }
    return ordered;
  }, [cols, columnOrder]);

  function getWidth(key: string): number {
    if (columnWidths[key] !== undefined) return columnWidths[key];
    return cols.find((c) => c.key === key)?.defaultWidth ?? 80;
  }

  function onResize(key: string, width: number) {
    dispatch(setColumnWidth({ gridId, key, width }));
    dispatch(saveGridPrefs());
  }

  function onReorder(fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    const current = orderedCols.map((c) => c.key);
    const fromIdx = current.indexOf(fromKey);
    const toIdx = current.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...current];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromKey);
    dispatch(setColumnOrder({ gridId, order: next }));
    dispatch(saveGridPrefs());
  }

  function onToggleFreeze(key: string) {
    dispatch(toggleFrozenColumn({ gridId, key }));
    dispatch(saveGridPrefs());
  }

  const frozenSet = useMemo(() => new Set(frozenColumns ?? []), [frozenColumns]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: columnWidths drives getWidth; listing it covers the dependency
  const stickyOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let left = 0;
    for (const col of orderedCols) {
      if (frozenSet.has(col.key)) {
        offsets[col.key] = left;
        left += getWidth(col.key);
      }
    }
    return offsets;
  }, [orderedCols, frozenSet, columnWidths]);

  function getStickyProps(
    key: string
  ): { style: React.CSSProperties; isLastFrozen: boolean } | null {
    if (!frozenSet.has(key)) return null;
    const left = stickyOffsets[key] ?? 0;
    const orderedFrozen = orderedCols.filter((c) => frozenSet.has(c.key));
    const isLastFrozen = orderedFrozen[orderedFrozen.length - 1]?.key === key;
    return {
      style: { position: "sticky", left, zIndex: 20 },
      isLastFrozen,
    };
  }

  return {
    orderedCols,
    frozenColumns: frozenColumns ?? [],
    getWidth,
    getStickyProps,
    onResize,
    onReorder,
    onToggleFreeze,
  };
}
