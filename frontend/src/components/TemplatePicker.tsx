import { useEffect, useRef, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";
import { LAYOUT_TEMPLATES, useDashboard } from "./DashboardLayout.tsx";

// Templates only available to admins
const ADMIN_ONLY_TEMPLATES = new Set(["admin"]);

export function TemplatePicker() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { resetLayout } = useDashboard();
  const userRole = useAppSelector((s) => s.auth.user?.role);

  const visibleTemplates = LAYOUT_TEMPLATES.filter(
    (tpl) => !ADMIN_ONLY_TEMPLATES.has(tpl.id) || userRole === "admin"
  );

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="Switch layout template"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors px-1.5 py-0.5 rounded border border-gray-700 hover:border-gray-500"
      >
        <span className="text-sm leading-none">⊞</span>
        Layout
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[200px]">
          <span className="text-[9px] text-gray-500 px-2 py-1 uppercase tracking-wider">
            Layout Templates
          </span>
          {visibleTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                resetLayout(tpl.model);
                setOpen(false);
              }}
              className="flex flex-col items-start gap-0.5 px-2 py-1.5 rounded text-left hover:bg-gray-800 transition-colors"
            >
              <span className="flex items-center gap-1 text-xs text-gray-200 font-medium">
                {tpl.locked && <span className="text-[10px] text-gray-500">🔒</span>}
                {tpl.label}
              </span>
              <span className="text-[10px] text-gray-500">{tpl.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
