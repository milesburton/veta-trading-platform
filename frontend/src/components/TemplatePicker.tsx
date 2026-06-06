import { useSignal } from "@preact/signals-react";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import { useEffect, useRef } from "react";
import { LAYOUT_TEMPLATES, useDashboard } from "./DashboardLayout.tsx";

// Templates only available to admins
const ADMIN_ONLY_TEMPLATES = new Set([
  "admin",
  "market-feeds",
  "system-status",
  "pipeline-ops",
  "administration",
]);

export function TemplatePicker() {
  const open = useSignal(false);
  const ref = useRef<HTMLDivElement>(null);
  const { resetLayout } = useDashboard();
  const userRole = useAppSelector((s) => s.auth.user?.role);

  const visibleTemplates = LAYOUT_TEMPLATES.filter(
    (tpl) => !ADMIN_ONLY_TEMPLATES.has(tpl.id) || userRole === "admin"
  );

  useEffect(() => {
    if (!open.value) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        open.value = false;
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open.value, open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="Switch layout template"
        onClick={() => {
          open.value = !open.value;
        }}
        className="flex items-center gap-1 text-xs text-label hover:text-secondary transition-colors px-1.5 py-0.5 rounded border border-divider hover:border-muted"
      >
        <span className="text-sm leading-none">⊞</span>
        Layout
      </button>

      {open.value && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-divider rounded shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[200px]">
          <span className="text-[9px] text-muted px-2 py-1 uppercase tracking-wider">
            Layout Templates
          </span>
          {visibleTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              data-testid={`layout-template-${tpl.id}`}
              onClick={() => {
                resetLayout(tpl.model);
                open.value = false;
              }}
              className="flex flex-col items-start gap-0.5 px-2 py-1.5 rounded text-left hover:bg-panel transition-colors"
            >
              <span className="flex items-center gap-1 text-xs text-secondary font-medium">
                {tpl.locked && <span className="text-[10px] text-muted">🔒</span>}
                {tpl.label}
              </span>
              <span className="text-[10px] text-muted">{tpl.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
