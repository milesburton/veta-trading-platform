import type { ServiceHealth } from "../types.ts";
import { StatusDot } from "./StatusDot";

export function ServiceRow({ svc }: { svc: ServiceHealth }) {
  const unavailable = svc.optional && svc.state === "error";

  function label(state: ServiceHealth["state"]) {
    if (unavailable) return <span className="text-gray-600">unavailable</span>;
    if (state === "ok") return <span className="text-emerald-400">ok</span>;
    if (state === "error") return <span className="text-red-400">error</span>;
    return <span className="text-gray-500">—</span>;
  }

  const info =
    Object.entries(svc.meta).length > 0
      ? Object.entries(svc.meta)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")
      : svc.lastChecked
        ? new Date(svc.lastChecked).toLocaleTimeString()
        : "—";

  return (
    <tr className={`border-b border-gray-800/40 ${unavailable ? "opacity-40" : ""}`}>
      <td className="px-3 py-2 max-w-0 truncate">
        <span className="flex items-center gap-2">
          <StatusDot state={unavailable ? "unknown" : svc.state} />
          {svc.link ? (
            <a
              href={svc.link}
              target="_blank"
              rel="noreferrer"
              className="text-gray-200 hover:text-emerald-400 transition-colors underline-offset-2 hover:underline truncate"
              title={svc.name}
            >
              {svc.name}
            </a>
          ) : (
            <span className="text-gray-200 truncate" title={svc.name}>
              {svc.name}
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{label(svc.state)}</td>
      <td className="px-3 py-2 max-w-0 font-mono text-gray-400">
        <span className="block truncate" title={svc.version}>
          {svc.version}
        </span>
      </td>
      <td className="px-3 py-2 max-w-0 text-gray-500 tabular-nums">
        <span className="block truncate" title={info}>
          {info}
        </span>
      </td>
    </tr>
  );
}

export default ServiceRow;
