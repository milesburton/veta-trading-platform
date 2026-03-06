import { useRef } from "react";
import type { GridId } from "../../store/gridPrefsSlice.ts";
import { saveGridPrefs, setSort } from "../../store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";

interface ResizableHeaderProps {
  colKey: string;
  width: number;
  minWidth?: number;
  gridId: GridId;
  sortable?: boolean;
  onResize: (key: string, width: number) => void;
  onColumnDragStart?: (key: string) => void;
  onColumnDrop?: (targetKey: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  align?: "left" | "right";
  title?: string;
  className?: string;
  children: React.ReactNode;
}

export function ResizableHeader({
  colKey,
  width,
  minWidth = 40,
  gridId,
  sortable = false,
  onResize,
  onColumnDragStart,
  onColumnDrop,
  onContextMenu,
  align,
  title,
  className = "",
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

  return (
    <th
      style={{ width, minWidth, position: "relative" }}
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
      className={`select-none ${textAlign} ${className}`}
      aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: role is set conditionally to "button" when sortable */}
      <span
        className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""} ${sortable ? "cursor-pointer group" : ""}`}
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
              isActive ? "text-sky-400" : "text-gray-700 group-hover:text-gray-500"
            }`}
            aria-hidden="true"
          >
            {indicator || "↕"}
          </span>
        )}
      </span>
      <div className="resize-handle" onMouseDown={startResize} aria-hidden="true" />
    </th>
  );
}
