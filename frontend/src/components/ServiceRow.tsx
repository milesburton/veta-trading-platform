import {
  deriveDisplayState,
  isExpectedAbsence,
  isHibernating,
} from "@veta/frontend/lib/serviceHealth.ts";
import type { ServiceHealth } from "@veta/frontend/types.ts";
import { formatUtcTime } from "@veta/frontend/utils/clock.ts";
import { StatusDot } from "./StatusDot";

export function ServiceRow({ svc }: { svc: ServiceHealth }) {
  const unavailable = isExpectedAbsence(svc);
  const asleep = isHibernating(svc);
  const displayState = deriveDisplayState(svc);

  function label(state: ReturnType<typeof deriveDisplayState>) {
    if (asleep) return <span className="text-subtle">asleep</span>;
    if (svc.optional && state === "error") return <span className="text-subtle">unavailable</span>;
    if (state === "ok") return <span className="text-emerald-400">ok</span>;
    if (state === "warn") return <span className="text-amber-400">warn</span>;
    if (state === "starting") return <span className="text-sky-400">starting</span>;
    if (state === "error") return <span className="text-red-400">error</span>;
    return <span className="text-muted">—</span>;
  }

  const info =
    Object.entries(svc.meta).length > 0
      ? Object.entries(svc.meta)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")
      : svc.lastChecked
        ? formatUtcTime(svc.lastChecked)
        : "—";

  return (
    <tr className={`border-b border-panel/40 ${unavailable ? "opacity-40" : ""}`}>
      <td className="px-3 py-2 max-w-0 truncate">
        <span className="flex items-center gap-2">
          <StatusDot state={unavailable && !asleep ? "unknown" : displayState} />
          {svc.link ? (
            <a
              href={svc.link}
              target="_blank"
              rel="noreferrer"
              className="text-secondary hover:text-emerald-400 transition-colors underline-offset-2 hover:underline truncate"
              title={svc.name}
            >
              {svc.name}
            </a>
          ) : (
            <span className="text-secondary truncate" title={svc.name}>
              {svc.name}
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{label(displayState)}</td>
      <td className="px-3 py-2 max-w-0 font-mono text-label">
        <span className="block truncate" title={svc.version}>
          {svc.version}
        </span>
      </td>
      <td className="px-3 py-2 max-w-0 text-muted tabular-nums">
        <span className="block truncate" title={info}>
          {info}
        </span>
      </td>
    </tr>
  );
}
