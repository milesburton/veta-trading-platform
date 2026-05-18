import { useSignal } from "@preact/signals-react";
import type { IJsonModel, TabNode } from "flexlayout-react";
import { Actions, Model } from "flexlayout-react";
import { useEffect, useRef } from "react";
import { useFrontendMemoryTelemetry } from "../hooks/useFrontendMemoryTelemetry.ts";
import type { AlertSeverity } from "../store/alertsSlice.ts";
import { alertAdded, selectAlertCount, selectHighestSeverity } from "../store/alertsSlice.ts";
import { clearUser } from "../store/authSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  DEPLOYMENT,
  SERVICES,
  useGetDataDepthQuery,
  useGetServiceHealthQuery,
} from "../store/servicesApi.ts";
import type { Theme } from "../store/themeSlice.ts";
import { saveTheme, setTheme } from "../store/themeSlice.ts";
import { dismissUpdateAvailable, selectOrderTicketWindowSize } from "../store/uiSlice.ts";
import { useDeleteSessionMutation } from "../store/userApi.ts";
import type { ServiceHealth } from "../types.ts";
import { openOrderTicketWindow } from "../utils/orderTicketWindow.ts";
import { ALERTS_DRAWER_ID, AlertDrawer } from "./AlertDrawer.tsx";
import { BuildInfo } from "./BuildInfo.tsx";
import { ComponentPicker } from "./ComponentPicker.tsx";
import { useDashboard } from "./dashboard/DashboardContext.tsx";
import type { TabChannelConfig } from "./dashboard/panelRegistry.ts";
import { DATA_DEPTH_DRAWER_ID, DataDepthDrawer } from "./drawers/DataDepthDrawer.tsx";
import { useDrawers } from "./drawers/DrawersContext.tsx";
import { LOGS_DRAWER_ID, LogsDrawer } from "./drawers/LogsDrawer.tsx";
import { KillSwitchButton } from "./KillSwitchButton.tsx";
import { ServiceStatus } from "./ServiceStatus.tsx";
import { TemplatePicker } from "./TemplatePicker.tsx";

function useAllServiceHealth(): ServiceHealth[] {
  const r0 = useGetServiceHealthQuery(SERVICES[0], { pollingInterval: 10_000 });
  const r1 = useGetServiceHealthQuery(SERVICES[1], { pollingInterval: 10_000 });
  const r2 = useGetServiceHealthQuery(SERVICES[2], { pollingInterval: 10_000 });
  const r3 = useGetServiceHealthQuery(SERVICES[3], { pollingInterval: 10_000 });
  const r4 = useGetServiceHealthQuery(SERVICES[4], { pollingInterval: 10_000 });
  const r5 = useGetServiceHealthQuery(SERVICES[5], { pollingInterval: 10_000 });
  const r6 = useGetServiceHealthQuery(SERVICES[6], { pollingInterval: 10_000 });
  const r7 = useGetServiceHealthQuery(SERVICES[7], { pollingInterval: 10_000 });
  const r8 = useGetServiceHealthQuery(SERVICES[8], { pollingInterval: 10_000 });
  const r9 = useGetServiceHealthQuery(SERVICES[9], { pollingInterval: 10_000 });
  const r10 = useGetServiceHealthQuery(SERVICES[10], {
    pollingInterval: 10_000,
  });
  const r11 = useGetServiceHealthQuery(SERVICES[11], {
    pollingInterval: 10_000,
  });
  const r12 = useGetServiceHealthQuery(SERVICES[12], {
    pollingInterval: 10_000,
    skip: !SERVICES[12],
  });
  const r13 = useGetServiceHealthQuery(SERVICES[13], {
    pollingInterval: 10_000,
    skip: !SERVICES[13],
  });
  const r14 = useGetServiceHealthQuery(SERVICES[14], {
    pollingInterval: 10_000,
    skip: !SERVICES[14],
  });
  const r15 = useGetServiceHealthQuery(SERVICES[15], {
    pollingInterval: 10_000,
    skip: !SERVICES[15],
  });
  const r16 = useGetServiceHealthQuery(SERVICES[16], {
    pollingInterval: 10_000,
    skip: !SERVICES[16],
  });
  const r17 = useGetServiceHealthQuery(SERVICES[17], {
    pollingInterval: 10_000,
    skip: !SERVICES[17],
  });
  const r18 = useGetServiceHealthQuery(SERVICES[18], {
    pollingInterval: 10_000,
    skip: !SERVICES[18],
  });
  const r19 = useGetServiceHealthQuery(SERVICES[19], {
    pollingInterval: 10_000,
    skip: !SERVICES[19],
  });
  const r20 = useGetServiceHealthQuery(SERVICES[20], {
    pollingInterval: 10_000,
    skip: !SERVICES[20],
  });
  const r21 = useGetServiceHealthQuery(SERVICES[21], {
    pollingInterval: 10_000,
    skip: !SERVICES[21],
  });
  const r22 = useGetServiceHealthQuery(SERVICES[22], {
    pollingInterval: 10_000,
    skip: !SERVICES[22],
  });

  return SERVICES.map((svc, i) => {
    const result = [
      r0,
      r1,
      r2,
      r3,
      r4,
      r5,
      r6,
      r7,
      r8,
      r9,
      r10,
      r11,
      r12,
      r13,
      r14,
      r15,
      r16,
      r17,
      r18,
      r19,
      r20,
      r21,
      r22,
    ][i];
    if (result.data) return result.data;
    if (result.isError) {
      return {
        name: svc.name,
        url: svc.url,
        link: svc.link,
        optional: svc.optional,
        alertOnDeployments: svc.alertOnDeployments,
        state: "error" as const,
        version: "—",
        meta: {},
        lastChecked: Date.now(),
      };
    }
    return {
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
  });
}

export { useAllServiceHealth };

const THEME_OPTIONS: { id: Theme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "darker", label: "OLED" },
  { id: "light", label: "Light" },
  { id: "high-contrast", label: "High Contrast" },
];

export function ThemeSwitcher() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.theme.theme);
  const open = useSignal(false);

  function handleSelect(t: Theme) {
    dispatch(setTheme(t));
    localStorage.setItem("veta-theme", t);
    dispatch(saveTheme(t));
    open.value = false;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          open.value = !open.value;
        }}
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-divider bg-panel/60 text-label hover:bg-divider/60 hover:border-muted hover:text-default font-semibold text-[11px] tracking-wide transition-all"
      >
        Theme
      </button>
      {open.value && (
        <>
          <button
            type="button"
            aria-label="Close theme picker"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              open.value = false;
            }}
          />
          <div className="absolute right-0 top-7 z-20 w-36 bg-surface border border-divider rounded shadow-xl text-xs overflow-hidden">
            {THEME_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleSelect(id)}
                className={`w-full text-left px-3 py-2 transition-colors ${
                  theme === id
                    ? "bg-divider text-primary"
                    : "text-label hover:bg-panel hover:text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AlertCentreButton({ services }: { services: ServiceHealth[] }) {
  const dispatch = useAppDispatch();
  const { open, close, isOpen } = useDrawers();
  const drawerOpen = isOpen(ALERTS_DRAWER_ID);
  const alertCount = useAppSelector(selectAlertCount);
  const highestSeverity = useAppSelector(selectHighestSeverity);
  const prevServiceStates = useRef<Record<string, string>>({});
  const { activePanelIds, model, setModel } = useDashboard();
  const isPinned = activePanelIds.has("alerts");

  function focusAlertsTab() {
    let tabId: string | undefined;
    model.visitNodes((node) => {
      if (!tabId && node.getType() === "tab") {
        const cfg = (node as TabNode).getConfig() as TabChannelConfig | undefined;
        if (cfg?.panelType === "alerts") tabId = node.getId();
      }
    });
    if (tabId) {
      model.doAction(Actions.selectTab(tabId));
      setModel(Model.fromJson(model.toJson() as IJsonModel));
    }
  }

  useEffect(() => {
    const prev = prevServiceStates.current;
    for (const svc of services) {
      const prevState = prev[svc.name];
      const curState = svc.state;
      const alertable = !svc.alertOnDeployments || svc.alertOnDeployments.includes(DEPLOYMENT);
      if (alertable && prevState !== undefined && prevState !== "error" && curState === "error") {
        dispatch(
          alertAdded({
            severity: "CRITICAL",
            source: "service",
            message: `Service offline: ${svc.name}`,
            detail: svc.url,
            ts: Date.now(),
          })
        );
      }
      if (alertable && prevState === "error" && curState === "ok") {
        dispatch(
          alertAdded({
            severity: "INFO",
            source: "service",
            message: `Service recovered: ${svc.name}`,
            ts: Date.now(),
          })
        );
      }
      prev[svc.name] = curState;
    }
  }, [services, dispatch]);

  const SEVERITY_CLS: Record<AlertSeverity, string> = {
    CRITICAL: "border-red-500 bg-red-600 text-white animate-pulse",
    WARNING: "border-amber-500 bg-amber-600/80 text-white",
    INFO: "border-divider bg-panel/60 text-label hover:bg-divider/60 hover:border-muted hover:text-default",
  };
  const btnCls = highestSeverity ? SEVERITY_CLS[highestSeverity] : SEVERITY_CLS.INFO;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isPinned) focusAlertsTab();
          else open(ALERTS_DRAWER_ID);
        }}
        title={isPinned ? "Jump to Alerts panel" : "Alert Centre"}
        data-testid="alert-bell-btn"
        className={`flex items-center gap-1.5 px-2 py-1 rounded border font-semibold text-[11px] tracking-wide transition-all ${btnCls}`}
      >
        Alerts
        {alertCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/20 text-[9px] font-bold leading-none">
            {alertCount > 99 ? "99+" : alertCount}
          </span>
        )}
      </button>
      {drawerOpen && !isPinned && <AlertDrawer onClose={() => close(ALERTS_DRAWER_ID)} />}
    </>
  );
}

const FEED_STALE_MS = 5_000;
const FEED_DEAD_MS = 15_000;
const FEED_LABELS: Record<string, string> = {
  market: "Market",
  orders: "Orders",
  algo: "Algo",
  news: "News",
};

function feedAgeLabel(ms: number | null): string {
  if (ms === null) return "–";
  const s = Math.floor(ms / 1000);
  return s === 0 ? "live" : `${s}s`;
}

function DataFreshness() {
  const connected = useAppSelector((s) => s.market.connected);
  const lastSeenAt = useAppSelector((s) => s.feed.lastSeenAt);
  const now = useSignal(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      now.value = Date.now();
    }, 1000);
    return () => clearInterval(id);
  }, [now]);

  if (!connected) {
    return (
      <span
        data-testid="feed-status"
        title="Gateway disconnected — all data sources offline"
        className="flex items-center gap-1.5 text-[10px] text-red-400 tabular-nums"
      >
        <span className="text-muted">Feed</span>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        disconnected
      </span>
    );
  }

  const sources = Object.entries(lastSeenAt) as [string, number | null][];
  const marketTs = lastSeenAt.market;
  const marketAge = marketTs === null ? null : now.value - marketTs;
  const marketDead = marketAge === null || marketAge > FEED_DEAD_MS;
  const marketSlow = marketAge !== null && marketAge > FEED_STALE_MS;
  const live = !marketDead && !marketSlow;

  const dotClass = marketDead ? "bg-red-500" : marketSlow ? "bg-amber-400" : "bg-emerald-500";
  const textClass = marketDead
    ? "text-red-400"
    : marketSlow
      ? "text-amber-400"
      : "text-emerald-400";

  const tooltip = sources
    .map(([key, ts]) => {
      const age = ts === null ? null : now.value - ts;
      return `${FEED_LABELS[key] ?? key}: ${feedAgeLabel(age)}`;
    })
    .join("  |  ");

  return (
    <span
      data-testid="feed-status"
      title={`Market data drives the headline. Other feeds are event-driven and only update when activity occurs.\n${tooltip}`}
      className={`flex items-center gap-1.5 text-[10px] tabular-nums ${textClass}`}
    >
      <span className="text-muted">Feed</span>
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass} ${live ? "animate-pulse" : ""}`}
      />
      {marketDead ? "stale" : marketSlow ? "slow" : "live"}
    </span>
  );
}

const ENV_BADGE_STYLES: Record<string, { label: string; title: string; cls: string }> = {
  local: {
    label: "local",
    title: "Local development build",
    cls: "bg-sky-900/50 text-sky-400 border-sky-800",
  },
  uat: {
    label: "uat",
    title: "Internal UAT environment — not production",
    cls: "bg-amber-900/50 text-amber-300 border-amber-800",
  },
  fly: {
    label: "demo",
    title: "Public Fly.io demo deployment",
    cls: "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  },
};

function EnvironmentBadge() {
  if (DEPLOYMENT === "playwright") return null;
  const style = ENV_BADGE_STYLES[DEPLOYMENT] ?? {
    label: DEPLOYMENT,
    title: `${DEPLOYMENT} deployment`,
    cls: "bg-panel text-default border-divider",
  };
  return (
    <span
      data-testid="env-badge"
      title={style.title}
      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase tracking-wider border ${style.cls}`}
    >
      {style.label}
    </span>
  );
}

function LogsButton() {
  const { toggle, isOpen } = useDrawers();
  const open = isOpen(LOGS_DRAWER_ID);
  return (
    <button
      type="button"
      onClick={() => toggle(LOGS_DRAWER_ID)}
      title="Open log search (Loki-backed when available, ring-buffered fallback otherwise)"
      data-testid="logs-btn"
      aria-pressed={open}
      className={`flex items-center gap-1.5 px-2 py-1 rounded border font-semibold text-[11px] tracking-wide transition-all ${
        open
          ? "border-emerald-700 bg-emerald-900/30 text-emerald-300"
          : "border-divider bg-panel/60 text-label hover:border-emerald-700 hover:text-emerald-300"
      }`}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
        <path d="M2 2h12v2H2zm0 5h12v2H2zm0 5h12v2H2z" />
      </svg>
      Logs
    </button>
  );
}

const DATA_DEPTH_THRESHOLDS = { good: 7, limited: 0.25 };

function depthLabelOnly(days: number): string {
  if (days >= 1) return `${Math.round(days)}d`;
  if (days > 0) return `${Math.round(days * 24)}h`;
  return "none";
}

function dataQualityLabel(days: number): {
  label: string;
  color: string;
  dotColor: string;
} {
  const label = depthLabelOnly(days);
  if (days >= DATA_DEPTH_THRESHOLDS.good) {
    return { label, color: "text-emerald-400", dotColor: "bg-emerald-500" };
  }
  if (days >= DATA_DEPTH_THRESHOLDS.limited) {
    return { label, color: "text-amber-400", dotColor: "bg-amber-400" };
  }
  return { label, color: "text-red-400", dotColor: "bg-red-500" };
}

export function DataDepthIndicator() {
  const { data, isLoading } = useGetDataDepthQuery(undefined, {
    pollingInterval: 30_000,
  });
  const { toggle, isOpen } = useDrawers();
  const drawerOpen = isOpen(DATA_DEPTH_DRAWER_ID);

  if (isLoading || !data) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-muted tabular-nums">
        <span className="text-muted">Market Data</span>
        <span>–</span>
      </span>
    );
  }

  // Use avgDays for the headline indicator so one shallow new symbol
  // doesn't drag the whole platform's signal red. minDays still drives
  // the warning messages and is shown in the tooltip.
  const { label, color, dotColor } = dataQualityLabel(data.avgDays);
  const warnings: string[] = [];
  if (data.minDays < DATA_DEPTH_THRESHOLDS.good) {
    warnings.push("Analytics accuracy is limited with less than 7 days of market data");
  }
  if (data.minDays < DATA_DEPTH_THRESHOLDS.limited) {
    warnings.push("Scenario analysis and volatility estimates are unreliable");
  }

  const tooltip = [
    `${data.totalSymbols} symbols tracked`,
    `Min depth: ${depthLabelOnly(data.minDays)}`,
    `Avg depth: ${depthLabelOnly(data.avgDays)}`,
    ...warnings,
    "Click for per-symbol detail",
  ].join("\n");

  return (
    <button
      type="button"
      data-testid="data-depth"
      title={tooltip}
      onClick={() => toggle(DATA_DEPTH_DRAWER_ID)}
      aria-pressed={drawerOpen}
      className={`flex items-center gap-1.5 text-[10px] tabular-nums hover:text-secondary transition-colors ${color}`}
    >
      <span className="text-muted">Market Data</span>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      {data.totalSymbols} sym · {label}
    </button>
  );
}

function MemoryIndicator() {
  const snapshot = useFrontendMemoryTelemetry();
  if (!snapshot) {
    return null;
  }
  const usedRounded = Math.round(snapshot.usedMb);
  const color =
    snapshot.pct > 75 ? "text-down" : snapshot.pct > 50 ? "text-amber-400" : "text-muted";
  const tooltip = [
    `JS heap: ${usedRounded} MB used`,
    `Total: ${Math.round(snapshot.totalMb)} MB`,
    `Limit: ${Math.round(snapshot.limitMb)} MB`,
    `${snapshot.pct.toFixed(1)}% of limit`,
    "Polls every 30s. Posted to /api/gateway/telemetry/frontend for ops.",
  ].join("\n");
  return (
    <span
      data-testid="memory-indicator"
      title={tooltip}
      className={`flex items-center gap-1.5 text-[10px] tabular-nums ${color}`}
    >
      <span className="text-muted">Heap</span>
      {usedRounded} MB
    </span>
  );
}

export function AppHeader() {
  const updateAvailable = useAppSelector((s) => s.ui.updateAvailable);
  const upgradeStatus = useAppSelector((s) => s.ui.upgradeStatus);
  const user = useAppSelector((s) => s.auth.user);
  const orderTicketWindowSize = useAppSelector(selectOrderTicketWindowSize);
  const services = useAllServiceHealth();
  const time = useSignal(new Date().toLocaleTimeString());
  const dispatch = useAppDispatch();
  const [deleteSession] = useDeleteSessionMutation();

  useEffect(() => {
    const id = setInterval(() => {
      time.value = new Date().toLocaleTimeString();
    }, 1000);
    return () => clearInterval(id);
  }, [time]);

  async function handleLogout() {
    try {
      await deleteSession();
    } finally {
      try {
        localStorage.removeItem("veta:last-known-user");
      } catch {}
      dispatch(clearUser());
      if (typeof window !== "undefined") {
        window.location.assign("/");
      }
    }
  }

  return (
    <div className="shrink-0" data-testid="app-header">
      {upgradeStatus.inProgress && (
        <div
          data-testid="upgrade-banner"
          className="flex items-center justify-center gap-2 px-4 py-1.5 bg-orange-900/70 border-b border-orange-700/60 text-xs text-orange-200"
        >
          <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
          <span>
            {upgradeStatus.message ??
              "System upgrade in progress — orders may be delayed or rejected."}
          </span>
        </div>
      )}
      {updateAvailable && (
        <div
          data-testid="update-banner"
          className="flex items-center justify-center gap-3 px-4 py-1.5 bg-amber-900/60 border-b border-amber-700/60 text-xs text-amber-300"
        >
          <span>
            A new version is available. Reload when convenient — your session will be preserved.
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            data-testid="reload-btn"
            className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
          >
            Reload now
          </button>
          <button
            type="button"
            onClick={() => dispatch(dismissUpdateAvailable())}
            data-testid="reload-later-btn"
            className="px-2 py-0.5 rounded border border-amber-700/60 hover:border-amber-500 text-amber-200 font-medium transition-colors"
          >
            Later
          </button>
        </div>
      )}
      <div className="flex items-center justify-between px-4 h-10 bg-surface border-b border-panel text-xs text-label">
        <div className="flex items-center gap-5">
          <span className="text-emerald-400 font-bold tracking-widest uppercase text-[11px]">
            VETA Trading Platform
          </span>
          <EnvironmentBadge />
          {user?.role === "trader" && (
            <button
              type="button"
              data-testid="new-order-btn"
              onClick={() => openOrderTicketWindow(orderTicketWindowSize)}
              className="px-3 py-1 text-[11px] font-semibold rounded bg-emerald-700 hover:bg-emerald-600 text-white transition-colors uppercase tracking-wide"
            >
              + New Order
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          <DataFreshness />
          <DataDepthIndicator />
          <MemoryIndicator />
          <div data-testid="service-health-cluster">
            <ServiceStatus services={services} />
          </div>
          <a
            href="https://veta.mnetcs.com/grafana/"
            target="_blank"
            rel="noopener noreferrer"
            title="Open Grafana dashboards"
            data-testid="grafana-link"
            className="flex items-center gap-1 text-[11px] text-label hover:text-secondary transition-colors"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 5-5" />
            </svg>
            <span>Grafana</span>
          </a>
          <a
            href="https://milesburton.github.io/veta-trading-platform/"
            target="_blank"
            rel="noopener noreferrer"
            title="Open documentation site"
            data-testid="docs-link"
            className="text-label hover:text-secondary transition-colors"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span className="sr-only">Open documentation</span>
          </a>
          <a
            href="https://github.com/milesburton/veta-trading-platform"
            target="_blank"
            rel="noopener noreferrer"
            title="View source on GitHub"
            className="text-label hover:text-secondary transition-colors"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="sr-only">View source on GitHub</span>
          </a>
          {user && (
            <>
              <div data-testid="theme-selector">
                <ThemeSwitcher />
              </div>
              <LogsButton />
              <AlertCentreButton services={services} />
            </>
          )}
          <div data-testid="kill-switch-wrapper">
            <KillSwitchButton />
          </div>
          <BuildInfo
            buildDate={import.meta.env.VITE_BUILD_DATE}
            commitSha={import.meta.env.VITE_COMMIT_SHA}
            version={import.meta.env.VITE_APP_VERSION}
            className="px-2 py-0.5 rounded border border-panel bg-page/60 text-[10px] text-label tabular-nums"
          />
          <span className="tabular-nums text-muted">{time.value}</span>
          {user && (
            <div className="flex items-center gap-2 pl-3 border-l border-panel">
              <span data-testid="user-menu-btn" className="flex items-center gap-1.5 text-label">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold tracking-wide ${
                    user.role === "admin"
                      ? "bg-orange-900/60 text-orange-300"
                      : "bg-divider text-secondary"
                  }`}
                >
                  {user.avatar_emoji}
                </span>
                <span>{user.name}</span>
                <span
                  className={`text-[9px] font-medium uppercase px-1 py-0.5 rounded ${
                    user.role === "admin"
                      ? "bg-orange-900/50 text-orange-400"
                      : "bg-blue-900/50 text-blue-400"
                  }`}
                >
                  {user.role}
                </span>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                title="Log out"
                data-testid="logout-btn"
                className="text-label hover:text-secondary transition-colors text-[10px] leading-none px-1.5 py-0.5 border border-divider hover:border-muted rounded"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
      <DataDepthDrawer />
      <LogsDrawer />
    </div>
  );
}

export function WorkspaceToolbar() {
  return (
    <div
      data-testid="workspace-toolbar"
      className="flex items-center gap-2 px-3 py-1.5 bg-page border-b border-panel text-xs"
    >
      <ComponentPicker />
      <div className="w-px h-3.5 bg-panel" />
      <TemplatePicker />
    </div>
  );
}

export function StatusBar() {
  return (
    <>
      <AppHeader />
      <WorkspaceToolbar />
    </>
  );
}
