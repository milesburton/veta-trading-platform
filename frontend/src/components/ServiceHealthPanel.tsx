import { useSignal } from "@preact/signals-react";
import { useCallback, useEffect, useRef } from "react";
import { alertAdded, purgeServiceAlerts } from "../store/alertsSlice.ts";
import { useAppDispatch } from "../store/hooks.ts";
import type { AppDispatch } from "../store/index.ts";
import {
  SERVICES,
  useGetServiceHealthQuery,
  useGetSystemMetricsQuery,
} from "../store/servicesApi.ts";
import type { ServiceHealth } from "../types.ts";

const REQUIRED_SERVICES = new Set([
  "Market Sim",
  "EMS",
  "OMS",
  "Limit Algo",
  "TWAP Algo",
  "POV Algo",
  "VWAP Algo",
]);

interface ServiceRowProps {
  svc: (typeof SERVICES)[number];
  onUpdate: (health: ServiceHealth) => void;
  dispatch: AppDispatch;
}

function ServiceRow({ svc, onUpdate, dispatch }: ServiceRowProps) {
  const { data, isError } = useGetServiceHealthQuery(svc, {
    pollingInterval: 10_000,
  });

  const prevRef = useRef<ServiceHealth | null>(null);

  useEffect(() => {
    if (data && data !== prevRef.current) {
      const prev = prevRef.current;
      prevRef.current = data;
      onUpdate(data);

      // Transition: error → ok — recovery alert + purge prior service alerts
      if (prev?.state === "error" && data.state === "ok") {
        dispatch(purgeServiceAlerts());
        dispatch(
          alertAdded({
            severity: "INFO",
            source: "service",
            message: `${svc.name}: recovered`,
            ts: Date.now(),
          })
        );
      }
    }
  }, [data, onUpdate, dispatch, svc.name]);

  useEffect(() => {
    if (isError) {
      const errHealth: ServiceHealth = {
        name: svc.name,
        url: svc.url,
        link: svc.link,
        optional: svc.optional,
        alertOnDeployments: svc.alertOnDeployments,
        state: "error",
        version: "—",
        meta: {},
        lastChecked: Date.now(),
      };
      if (prevRef.current?.state !== "error") {
        prevRef.current = errHealth;
        onUpdate(errHealth);

        // Transition: ok/unknown → error — tiered alert
        const isRequired = REQUIRED_SERVICES.has(svc.name);
        dispatch(
          alertAdded({
            severity: isRequired ? "CRITICAL" : "WARNING",
            source: "service",
            message: `${svc.name}: service down`,
            detail: svc.url,
            ts: Date.now(),
          })
        );
      }
    }
  }, [isError, svc, dispatch, onUpdate]);

  return null;
}

interface RowDisplayProps {
  health: ServiceHealth;
  index: number;
  now: number;
}

function RowDisplay({ health, index, now }: RowDisplayProps) {
  const isOk = health.state === "ok";
  const ageSecs = health.lastChecked != null ? Math.floor((now - health.lastChecked) / 1000) : null;

  return (
    <tr className={index % 2 === 0 ? "bg-gray-950" : "bg-gray-900"}>
      <td className="px-3 py-1 text-xs font-mono text-gray-200 whitespace-nowrap">
        {health.link ? (
          <a
            href={health.link}
            target="_blank"
            rel="noreferrer"
            className="hover:text-blue-400 transition-colors"
          >
            {health.name}
          </a>
        ) : (
          health.name
        )}
        {health.optional && <span className="ml-1 text-gray-500 text-[10px]">(opt)</span>}
      </td>
      <td className="px-3 py-1 text-xs font-mono">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
              isOk ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className={isOk ? "text-green-400" : "text-red-400"}>{isOk ? "ok" : "error"}</span>
        </span>
      </td>
      <td className="px-3 py-1 text-xs font-mono text-gray-400 whitespace-nowrap">
        {health.version}
      </td>
      <td className="px-3 py-1 text-xs font-mono text-gray-500 whitespace-nowrap">
        {ageSecs != null ? `${ageSecs}s ago` : "—"}
      </td>
    </tr>
  );
}

function gaugeColour(pct: number): string {
  if (pct >= 85) return "bg-red-500";
  if (pct >= 70) return "bg-amber-400";
  return "bg-green-500";
}

function GaugeRow({ label, pct }: { label: string; pct: number | null }) {
  if (pct == null) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="w-20 text-xs font-mono text-gray-400 flex-shrink-0">{label}</span>
        <span className="text-xs font-mono text-gray-600">unavailable</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-20 text-xs font-mono text-gray-400 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
        <div
          className={`h-full rounded ${gaugeColour(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs font-mono text-gray-300">{pct.toFixed(1)}%</span>
    </div>
  );
}

function HostResourcesSection() {
  const dispatch = useAppDispatch();
  const { data } = useGetSystemMetricsQuery(undefined, {
    pollingInterval: 30_000,
  });
  const lastAlertLevelRef = useRef<"none" | "warn" | "critical">("none");

  useEffect(() => {
    if (!data?.disk) return;
    const pct = data.disk.used_pct;
    const current = pct >= 90 ? "critical" : pct >= 80 ? "warn" : "none";
    if (current === lastAlertLevelRef.current) return;
    lastAlertLevelRef.current = current;
    if (current === "critical") {
      dispatch(
        alertAdded({
          severity: "CRITICAL",
          source: "service",
          message: `Host disk usage critical: ${pct.toFixed(1)}%`,
          ts: Date.now(),
        })
      );
    } else if (current === "warn") {
      dispatch(
        alertAdded({
          severity: "WARNING",
          source: "service",
          message: `Host disk usage high: ${pct.toFixed(1)}%`,
          ts: Date.now(),
        })
      );
    }
  }, [data, dispatch]);

  const disk = data?.disk ?? null;
  const mem = data?.memory ?? null;
  const diskPct = disk ? disk.used_pct : null;
  const memDisplayPct = mem
    ? Math.min(Math.round((mem.rss_mb / Math.max(mem.heap_total_mb, 1)) * 100), 100)
    : null;

  return (
    <div className="px-3 py-2 border-b border-gray-800 flex-shrink-0">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        Host Resources
      </div>
      <GaugeRow label="Disk" pct={diskPct} />
      <GaugeRow label="Memory (RSS)" pct={memDisplayPct} />
    </div>
  );
}

export function ServiceHealthPanel() {
  const dispatch = useAppDispatch();
  const healthMap = useSignal<Map<string, ServiceHealth>>(new Map());
  const now = useSignal(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      now.value = Date.now();
    }, 1_000);
    return () => clearInterval(id);
  }, [now]);

  const handleUpdate = useCallback(
    (health: ServiceHealth) => {
      const next = new Map(healthMap.value);
      next.set(health.name, health);
      healthMap.value = next;
    },
    [healthMap]
  );

  const allOk =
    healthMap.value.size > 0 &&
    Array.from(healthMap.value.values()).every((h) => h.state === "ok" || h.optional);

  return (
    <div className="h-full flex flex-col bg-gray-950 text-gray-200 overflow-auto">
      {SERVICES.map((svc) => (
        <ServiceRow key={svc.name} svc={svc} onUpdate={handleUpdate} dispatch={dispatch} />
      ))}

      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-100 tracking-wide uppercase">
          Service Health
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${
              allOk ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
            }`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                allOk ? "bg-green-400 animate-pulse" : "bg-red-400 animate-pulse"
              }`}
            />
            {allOk ? "all ok" : "degraded"}
          </span>
        </div>
      </div>

      <HostResourcesSection />

      <div className="overflow-auto flex-1">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800">
            <tr>
              <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Service
              </th>
              <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Status
              </th>
              <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Version
              </th>
              <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                Last Check
              </th>
            </tr>
          </thead>
          <tbody>
            {SERVICES.map((svc, idx) => {
              const health = healthMap.value.get(svc.name) ?? {
                name: svc.name,
                url: svc.url,
                link: svc.link,
                optional: svc.optional,
                alertOnDeployments: svc.alertOnDeployments,
                state: "unknown" as const,
                version: "—",
                meta: {},
                lastChecked: null,
              };
              return (
                <RowDisplay
                  key={svc.name}
                  health={health as ServiceHealth}
                  index={idx}
                  now={now.value}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
