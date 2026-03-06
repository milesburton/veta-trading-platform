import { useMemo } from "react";
import type { GridId } from "../store/gridPrefsSlice.ts";
import { saveGridPrefs, setColumnOrder, setColumnWidth } from "../store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import type { ColDef } from "../types/gridPrefs.ts";

export function useColumnLayout(
  gridId: GridId,
  cols: ColDef[]
): {
  orderedCols: ColDef[];
  getWidth: (key: string) => number;
  onResize: (key: string, width: number) => void;
  onReorder: (fromKey: string, toKey: string) => void;
} {
  const dispatch = useAppDispatch();
  const { columnWidths, columnOrder } = useAppSelector((s) => s.gridPrefs[gridId]);

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

  return { orderedCols, getWidth, onResize, onReorder };
}
