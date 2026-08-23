import { useSignal } from "@preact/signals-react";
import { useFrontendMemoryTelemetry } from "@veta/frontend/hooks/useFrontendMemoryTelemetry.ts";
import type { AlertSeverity } from "@veta/frontend/store/alertsSlice.ts";
import {
  alertAdded,
  selectAlertCount,
  selectHighestSeverity,
} from "@veta/frontend/store/alertsSlice.ts";
import { clearUser } from "@veta/frontend/store/authSlice.ts";
import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import {
  DEPLOYMENT,
  SERVICES,
  useGetDataDepthQuery,
  useGetServiceHealthQuery,
} from "@veta/frontend/store/servicesApi.ts";
import type { Theme } from "@veta/frontend/store/themeSlice.ts";
import { saveTheme, setTheme } from "@veta/frontend/store/themeSlice.ts";
import { dismissUpdateAvailable } from "@veta/frontend/store/uiSlice.ts";
import { useLogoutMutation } from "@veta/frontend/store/userApi.ts";
import type { ServiceHealth } from "@veta/frontend/types.ts";
import { formatUtcTime } from "@veta/frontend/utils/clock.ts";
import type { IJsonModel, TabNode } from "flexlayout-react";
import { Actions, Model } from "flexlayout-react";
import { useCallback, useEffect, useRef } from "react";
import { ALERTS_DRAWER_ID, AlertDrawer } from "./AlertDrawer.tsx";
import { BugReportModal } from "./BugReportModal.tsx";
import { BuildInfo } from "./BuildInfo.tsx";
import { ComponentPicker } from "./ComponentPicker.tsx";
import { useDashboard } from "./dashboard/DashboardContext.tsx";
import type { TabChannelConfig } from "./dashboard/panelRegistry.ts";
import { DATA_DEPTH_DRAWER_ID, DataDepthDrawer } from "./drawers/DataDepthDrawer.tsx";
import { useDrawers } from "./drawers/DrawersContext.tsx";
import { LOGS_DRAWER_ID, LogsDrawer } from "./drawers/LogsDrawer.tsx";
import { KillSwitchButton } from "./KillSwitchButton.tsx";
import { OverflowBar } from "./OverflowBar.tsx";
import { ServiceStatus } from "./ServiceStatus.tsx";
import { TemplatePicker } from "./TemplatePicker.tsx";

function useAllServiceHealth(): ServiceHealth[] {
  return SERVICES.map((svc) => {
    // docs: /development/contributing/
    // biome-ignore lint/correctness/useHookAtTopLevel: stable iteration over module-level constant
    const result = useGetServiceHealthQuery(svc, { pollingInterval: 10_000 });
    if (result.data) return result.data;
    const base = {
      name: svc.name,
      url: svc.url,
      link: svc.link,
      optional: svc.optional,
      alertOnDeployments: svc.alertOnDeployments,
      version: "—",
      meta: {},
    };
    if (result.isError) {
      const errData = result.error as ServiceHealth | undefined;
      return {
        ...base,
        state: errData?.state === "warn" ? ("warn" as const) : ("error" as const),
        lastChecked: Date.now(),
      };
    }
    return { ...base, state: "unknown" as const, lastChecked: null };
  });
}

export { useAllServiceHealth };

const THEME_OPTIONS: { id: Theme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "darker", label: "OLED" },
  { id: "light", label: "Light" },
  { id: "high-contrast", label: "High Contrast" },
];

const THEME_LABEL = Object.fromEntries(THEME_OPTIONS.map(({ id, label }) => [id, label])) as Record<
  Theme,
  string
>;

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
        aria-label={`Change theme (current: ${THEME_LABEL[theme]})`}
        title={`Change theme (current: ${THEME_LABEL[theme]})`}
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-divider bg-panel/60 text-label hover:bg-divider/60 hover:border-muted hover:text-default font-semibold text-[11px] tracking-wide transition-all"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
          <path d="M12 3a9 9 0 0 0-9 9v.5a2.5 2.5 0 0 0 2.5 2.5h1.86a1.5 1.5 0 0 1 1.06.44l1.45 1.45a2.5 2.5 0 0 0 3.53 0l1.45-1.45a1.5 1.5 0 0 1 1.06-.44h1.86A2.5 2.5 0 0 0 21 12.5V12a9 9 0 0 0-9-9Zm-5 9.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm3-3.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm4 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm3 3.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
        </svg>
        <span>Theme: {THEME_LABEL[theme]}</span>
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
      if (alertable && prevState !== undefined && prevState !== "warn" && curState === "warn") {
        dispatch(
          alertAdded({
            severity: "WARNING",
            source: "service",
            message: `Service degraded: ${svc.name}`,
            detail: svc.url,
            ts: Date.now(),
          })
        );
      }
      if (alertable && (prevState === "error" || prevState === "warn") && curState === "ok") {
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
    CRITICAL: "border-red-700 bg-red-700 text-white animate-pulse",
    WARNING: "border-amber-700 bg-amber-700 text-white",
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
        className="flex items-center gap-1.5 text-[10px] text-semantic-status-critical tabular-nums"
      >
        <span className="text-muted">Feed</span>
        <span className="w-1.5 h-1.5 rounded-full bg-semantic-status-critical shrink-0" />
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

  const dotClass = marketDead
    ? "bg-semantic-status-critical"
    : marketSlow
      ? "bg-semantic-status-warning"
      : "bg-semantic-status-success";
  const textClass = marketDead
    ? "text-semantic-status-critical"
    : marketSlow
      ? "text-semantic-status-warning"
      : "text-semantic-status-success";

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
    label: "Local",
    title: "Local development build",
    cls: "bg-semantic-status-info/6 text-semantic-status-info border-semantic-status-info/30",
  },
  uat: {
    label: "UAT",
    title: "Internal UAT environment — not production",
    cls: "bg-semantic-status-pending/6 text-semantic-status-pending border-semantic-status-pending/30",
  },
  fly: {
    label: "Demo",
    title: "Public Fly.io demo deployment",
    cls: "bg-semantic-status-success/6 text-semantic-status-success border-semantic-status-success/30",
  },
  prod: {
    label: "Production",
    title: "Production deployment",
    cls: "bg-semantic-status-success/6 text-semantic-status-success border-semantic-status-success/30",
  },
};

function EnvironmentBadge() {
  const isPlaywright = DEPLOYMENT === "playwright";
  const style = isPlaywright
    ? null
    : (ENV_BADGE_STYLES[DEPLOYMENT] ?? {
        label: DEPLOYMENT,
        title: `${DEPLOYMENT} deployment`,
        cls: "bg-panel text-default border-divider",
      });
  return (
    <span
      data-testid="env-badge"
      title={style?.title}
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border shrink-0 ${style?.cls ?? "bg-panel text-default border-divider"}`}
    >
      <span className="uppercase tracking-widest">VETA</span>
      {style && (
        <>
          <span className="opacity-50">·</span>
          <span className="font-mono tracking-wider text-[9px]">{style.label}</span>
        </>
      )}
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
    return {
      label,
      color: "text-semantic-status-success",
      dotColor: "bg-semantic-status-success",
    };
  }
  if (days >= DATA_DEPTH_THRESHOLDS.limited) {
    return {
      label,
      color: "text-semantic-status-warning",
      dotColor: "bg-semantic-status-warning",
    };
  }
  return { label, color: "text-semantic-status-critical", dotColor: "bg-semantic-status-critical" };
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
    snapshot.pct > 75
      ? "text-semantic-status-critical"
      : snapshot.pct > 50
        ? "text-semantic-status-warning"
        : "text-muted";
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
  const services = useAllServiceHealth();
  const time = useSignal(formatUtcTime(new Date()));
  const bugReportOpen = useSignal(false);
  const dispatch = useAppDispatch();
  const [logout] = useLogoutMutation();

  useEffect(() => {
    const id = setInterval(() => {
      time.value = formatUtcTime(new Date());
    }, 1000);
    return () => clearInterval(id);
  }, [time]);

  const closeBugReport = useCallback(() => {
    bugReportOpen.value = false;
  }, [bugReportOpen]);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      try {
        localStorage.removeItem("veta:last-known-user");
      } catch {}
      dispatch(clearUser());
      if (typeof window !== "undefined") {
        globalThis.location.assign("/");
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
            onClick={() => globalThis.location.reload()}
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
      <div className="flex items-center gap-3 px-4 h-10 bg-surface border-b border-panel text-xs text-label">
        <div className="flex items-center gap-2 shrink-0">
          <img src="/favicon.png" alt="" aria-hidden="true" className="h-5 w-5 rounded shrink-0" />
          <EnvironmentBadge />
          <BuildInfo
            buildDate={import.meta.env.VITE_BUILD_DATE}
            commitSha={import.meta.env.VITE_COMMIT_SHA}
            version={import.meta.env.VITE_APP_VERSION}
            className="px-2 py-0.5 rounded border border-panel bg-page/60 text-[10px] text-label tabular-nums"
          />
        </div>

        <div className="w-px self-stretch my-2 bg-panel shrink-0" />

        <OverflowBar
          className="gap-4 flex-1 min-w-0"
          menuLabel="More controls"
          testId="header-controls"
          menuClassName="gap-2 min-w-[200px]"
        >
          <DataFreshness />
          <DataDepthIndicator />
          <MemoryIndicator />
          <div data-testid="service-health-cluster">
            <ServiceStatus services={services} />
          </div>

          {user && (
            <>
              <LogsButton />
              <AlertCentreButton services={services} />
            </>
          )}

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
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
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
            title="Open the user guide"
            data-testid="docs-link"
            className="flex items-center gap-1 text-[11px] text-label hover:text-secondary transition-colors"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>User Guide</span>
          </a>
          {user && (
            <button
              type="button"
              onClick={() => {
                bugReportOpen.value = true;
              }}
              data-testid="bug-report-trigger"
              title="Raise a ticket"
              className="flex items-center gap-1 text-[11px] text-label hover:text-secondary transition-colors"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 2l1.88 1.88" />
                <path d="M14.12 3.88L16 2" />
                <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
                <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z" />
                <path d="M12 20v-9" />
                <path d="M6 13H2" />
                <path d="M22 13h-4" />
                <path d="M6 17l-3.5 3" />
                <path d="M18 17l3.5 3" />
                <path d="M6 9l-3.5-3" />
                <path d="M18 9l3.5-3" />
              </svg>
              <span>Raise ticket</span>
            </button>
          )}
        </OverflowBar>

        <div className="flex items-center gap-4 shrink-0">
          {user && (
            <div data-testid="theme-selector">
              <ThemeSwitcher />
            </div>
          )}
          <div data-testid="kill-switch-wrapper">
            <KillSwitchButton />
          </div>
          <span className="tabular-nums text-muted">{time.value}</span>
          {user && (
            <div className="flex items-center gap-2 pl-3 border-l border-panel">
              <span data-testid="user-menu-btn" className="flex items-center gap-1.5 text-label">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold tracking-wide ${
                    user.role === "admin"
                      ? "bg-semantic-status-warning/6 text-semantic-status-warning"
                      : "bg-divider text-secondary"
                  }`}
                >
                  {user.avatar_emoji}
                </span>
                <span>{user.name}</span>
                <span
                  className={`text-[9px] font-medium uppercase px-1 py-0.5 rounded ${
                    user.role === "admin"
                      ? "bg-semantic-status-warning/6 text-semantic-status-warning"
                      : "bg-semantic-status-info/6 text-semantic-status-info"
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
      <BugReportModal open={bugReportOpen.value} onClose={closeBugReport} />
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
