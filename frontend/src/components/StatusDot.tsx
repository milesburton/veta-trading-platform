import type { ServiceDisplayState } from "@veta/frontend/lib/serviceHealth.ts";

export function StatusDot({
  state,
  className = "",
}: {
  state: ServiceDisplayState;
  className?: string;
}) {
  function cls(s: ServiceDisplayState) {
    if (s === "ok") return "bg-emerald-400 shadow-[0_0_6px_#34d399]";
    if (s === "warn") return "bg-amber-400 shadow-[0_0_6px_#fbbf24]";
    if (s === "error") return "bg-red-500 shadow-[0_0_6px_#f87171]";
    if (s === "starting") return "bg-sky-400 shadow-[0_0_6px_#38bdf8] animate-pulse";
    if (s === "asleep") return "bg-muted";
    return "bg-muted";
  }

  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls(state)} ${className}`} />;
}
