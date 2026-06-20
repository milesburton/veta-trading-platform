import type { GridId } from "@veta/frontend/store/gridPrefsSlice.ts";
import { saveGridPrefs, setSort } from "@veta/frontend/store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import { useRef } from "react";

interface ResizableHeaderProps {
  colKey: string;
  width: number;
  minWidth?: number;
  gridId: GridId;
  sortable?: boolean;
  frozen?: boolean;
  isLastFrozen?: boolean;
  onResize: (key: string, width: number) => void;
  onColumnDragStart?: (key: string) => void;
  onColumnDrop?: (targetKey: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onToggleFreeze?: (key: string) => void;
  align?: "left" | "right";
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function ResizableHeader({
  colKey,
  width,
  minWidth = 40,
  gridId,
  sortable = false,
  frozen = false,
  isLastFrozen = false,
  onResize,
  onColumnDragStart,
  onColumnDrop,
  onContextMenu,
  onToggleFreeze,
  align,
  title,
  className = "",
  style,
  children,
}: ResizableHeaderProps) {
  const dispatch = useAppDispatch();
  const { sortField, sortDir } = useAppSelector((s) => s.gridPrefs[gridId]);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const isActive = sortable && sortField === colKey;
  const indicator = isActive && sortDir === "asc" ? "↑" : isActive && sortDir === "desc" ? "↓" : "";

  function handleSortClick() {
    if (!sortable) return;
    let nextDir: "asc" | "desc" | null;
    if (!isActive || sortDir === null) {
      nextDir = "asc";
    } else if (sortDir === "asc") {
      nextDir = "desc";
    } else {
      nextDir = null;
    }
    dispatch(setSort({ gridId, field: nextDir ? colKey : null, dir: nextDir }));
    dispatch(saveGridPrefs());
  }

  function startResize(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    function onMouseMove(me: MouseEvent) {
      const delta = me.clientX - startXRef.current;
      const newWidth = Math.max(minWidth, startWidthRef.current + delta);
      onResize(colKey, newWidth);
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const textAlign = align === "right" ? "text-right" : "text-left";
  const frozenBorder = isLastFrozen ? "border-r-2 border-r-divider" : "";

  return (
    <th
      style={{ width, minWidth, position: "relative", ...style }}
      draggable={!!onColumnDragStart}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onColumnDragStart?.(colKey);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        onColumnDrop?.(colKey);
      }}
      onContextMenu={onContextMenu}
      title={title}
      className={`select-none ${textAlign} ${frozenBorder} ${className}`}
      aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: role is set conditionally to "button" when sortable */}
      <span
        className={`flex items-center gap-1 ${
          align === "right" ? "justify-end" : ""
        } ${sortable ? "cursor-pointer group" : ""} ${onToggleFreeze ? "group/freeze" : ""}`}
        onClick={sortable ? handleSortClick : undefined}
        onKeyDown={
          sortable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") handleSortClick();
              }
            : undefined
        }
        role={sortable ? "button" : undefined}
        tabIndex={sortable ? 0 : undefined}
      >
        {children}
        {sortable && (
          <span
            className={`text-[9px] tabular-nums w-2.5 inline-block ${
              isActive ? "text-sky-400" : "text-divider group-hover:text-muted"
            }`}
            aria-hidden="true"
          >
            {indicator || "↕"}
          </span>
        )}
        {onToggleFreeze && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFreeze(colKey);
            }}
            title={frozen ? "Unfreeze column" : "Freeze column"}
            aria-pressed={frozen}
            className={`ml-0.5 shrink-0 transition-opacity ${
              frozen
                ? "text-sky-400 opacity-100"
                : "text-muted opacity-0 group-hover/freeze:opacity-100"
            }`}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
              {frozen ? (
                <path d="M8 0a1 1 0 0 1 1 1v1.586l1.293-1.293a1 1 0 1 1 1.414 1.414L10.414 4H12a1 1 0 0 1 0 2h-1.586l1.293 1.293a1 1 0 0 1-1.414 1.414L9 7.414V9a1 1 0 0 1-2 0V7.414L5.707 8.707a1 1 0 0 1-1.414-1.414L5.586 6H4a1 1 0 0 1 0-2h1.586L4.293 2.707a1 1 0 0 1 1.414-1.414L7 2.586V1a1 1 0 0 1 1-1zm0 9a1 1 0 0 1 1 1v1.586l1.293-1.293a1 1 0 1 1 1.414 1.414L10.414 13H12a1 1 0 0 1 0 2h-8a1 1 0 0 1 0-2h1.586l-1.293-1.293a1 1 0 0 1 1.414-1.414L7 11.586V10a1 1 0 0 1 1-1z" />
              ) : (
                <path d="M8 1a1 1 0 0 1 1 1v1.586l1.293-1.293a1 1 0 1 1 1.414 1.414L10.414 5H12a1 1 0 0 1 0 2h-1.586l1.293 1.293a1 1 0 0 1-1.414 1.414L9 7.414V9a1 1 0 0 1-2 0V7.414L5.707 8.707a1 1 0 0 1-1.414-1.414L5.586 7H4a1 1 0 0 1 0-2h1.586L4.293 3.707a1 1 0 0 1 1.414-1.414L7 3.586V2a1 1 0 0 1 1-1zM3 11a1 1 0 0 1 1-1h8a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1z" />
              )}
            </svg>
          </button>
        )}
      </span>
      <div className="resize-handle" onMouseDown={startResize} aria-hidden="true" />
    </th>
  );
}
