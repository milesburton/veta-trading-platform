import type { GridId } from "../../store/gridPrefsSlice.ts";
import { saveGridPrefs, setSort } from "../../store/gridPrefsSlice.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";

interface Props {
  field: string;
  gridId: GridId;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

export function SortableHeader({ field, gridId, className = "", title, children }: Props) {
  const dispatch = useAppDispatch();
  const { sortField, sortDir } = useAppSelector((s) => s.gridPrefs[gridId]);

  const isActive = sortField === field;
  const indicator = isActive && sortDir === "asc" ? "↑" : isActive && sortDir === "desc" ? "↓" : "";

  function handleClick() {
    let nextDir: "asc" | "desc" | null;
    if (!isActive || sortDir === null) {
      nextDir = "asc";
    } else if (sortDir === "asc") {
      nextDir = "desc";
    } else {
      nextDir = null;
    }
    dispatch(setSort({ gridId, field: nextDir ? field : null, dir: nextDir }));
    dispatch(saveGridPrefs());
  }

  return (
    <th
      className={`cursor-pointer select-none group ${className}`}
      onClick={handleClick}
      title={title}
      aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className="flex items-center gap-1">
        {children}
        <span
          className={`text-[9px] tabular-nums w-2.5 inline-block ${
            isActive ? "text-sky-400" : "text-gray-700 group-hover:text-gray-500"
          }`}
          aria-hidden="true"
        >
          {indicator || "↕"}
        </span>
      </span>
    </th>
  );
}
