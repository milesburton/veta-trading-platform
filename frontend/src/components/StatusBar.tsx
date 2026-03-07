import { useSignal } from "@preact/signals-react";
import type { IJsonModel, TabNode } from "flexlayout-react";
import { Actions, Model } from "flexlayout-react";
import { useEffect, useRef, useState } from "react";
import type { AlertSeverity } from "../store/alertsSlice.ts";
import { alertAdded, selectAlertCount, selectHighestSeverity } from "../store/alertsSlice.ts";
import { clearUser } from "../store/authSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { DEPLOYMENT, SERVICES, useGetServiceHealthQuery } from "../store/servicesApi.ts";
import type { Theme } from "../store/themeSlice.ts";
import { saveTheme, setTheme } from "../store/themeSlice.ts";
import type { ServiceHealth } from "../types.ts";
import { AlertDrawer } from "./AlertDrawer.tsx";
import { ComponentPicker } from "./ComponentPicker.tsx";
import { useDashboard } from "./dashboard/DashboardContext.tsx";
import type { TabChannelConfig } from "./dashboard/panelRegistry.ts";
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
  const r10 = useGetServiceHealthQuery(SERVICES[10], { pollingInterval: 10_000 });
  const r11 = useGetServiceHealthQuery(SERVICES[11], { pollingInterval: 10_000 });

  return SERVICES.map((svc, i) => {
    const result = [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11][i];
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

// ─── ThemeSwitcher ────────────────────────────────────────────────────────────

const THEME_OPTIONS: { id: Theme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "darker", label: "OLED" },
  { id: "light", label: "Light" },
  { id: "high-contrast", label: "High Contrast" },
];

function ThemeSwitcher() {
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
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-gray-700 bg-gray-800/60 text-gray-400 hover:bg-gray-700/60 hover:border-gray-500 hover:text-gray-300 font-semibold text-[11px] tracking-wide transition-all"
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
          <div className="absolute right-0 top-7 z-20 w-36 bg-gray-900 border border-gray-700 rounded shadow-xl text-xs overflow-hidden">
            {THEME_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleSelect(id)}
                className={`w-full text-left px-3 py-2 transition-colors ${
                  theme === id
                    ? "bg-gray-700 text-gray-100"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
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

// ─── AlertCentreButton ────────────────────────────────────────────────────────

function AlertCentreButton({ services }: { services: ServiceHealth[] }) {
  const dispatch = useAppDispatch();
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    INFO: "border-gray-700 bg-gray-800/60 text-gray-400 hover:bg-gray-700/60 hover:border-gray-500 hover:text-gray-300",
  };
  const btnCls = highestSeverity ? SEVERITY_CLS[highestSeverity] : SEVERITY_CLS.INFO;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isPinned) focusAlertsTab();
          else setDrawerOpen(true);
        }}
        title={isPinned ? "Jump to Alerts panel" : "Alert Centre"}
        className={`flex items-center gap-1.5 px-2 py-1 rounded border font-semibold text-[11px] tracking-wide transition-all ${btnCls}`}
      >
        Alerts
        {alertCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/20 text-[9px] font-bold leading-none">
            {alertCount > 99 ? "99+" : alertCount}
          </span>
        )}
      </button>
      {drawerOpen && !isPinned && <AlertDrawer onClose={() => setDrawerOpen(false)} />}
    </>
  );
}

// ─── AppHeader: brand + feed + services + clock + user ───────────────────────

export function AppHeader() {
  const connected = useAppSelector((s) => s.market.connected);
  const updateAvailable = useAppSelector((s) => s.ui.updateAvailable);
  const user = useAppSelector((s) => s.auth.user);
  const services = useAllServiceHealth();
  const time = useSignal(new Date().toLocaleTimeString());
  const dispatch = useAppDispatch();

  useEffect(() => {
    const id = setInterval(() => {
      time.value = new Date().toLocaleTimeString();
    }, 1000);
    return () => clearInterval(id);
  }, [time]);

  async function handleLogout() {
    try {
      await fetch("/api/user-service/sessions", { method: "DELETE", credentials: "include" });
    } finally {
      dispatch(clearUser());
    }
  }

  return (
    <div className="shrink-0">
      {updateAvailable && (
        <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-amber-900/60 border-b border-amber-700/60 text-xs text-amber-300">
          <span>A new version is available.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
          >
            Reload
          </button>
        </div>
      )}
      <div className="flex items-center justify-between px-4 h-10 bg-gray-900 border-b border-gray-800 text-xs text-gray-400">
        <div className="flex items-center gap-5">
          <span className="text-emerald-400 font-bold tracking-widest uppercase text-[11px]">
            Equities Trading Simulator
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                connected ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-red-500"
              }`}
            />
            <span className={connected ? "text-emerald-400" : "text-red-400"}>
              {connected ? "Live" : "Disconnected"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ServiceStatus services={services} />
          <a
            href="https://github.com/milesburton/equities-trading-simulator"
            target="_blank"
            rel="noopener noreferrer"
            title="View source on GitHub"
            className="text-gray-600 hover:text-gray-300 transition-colors"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="sr-only">View source on GitHub</span>
          </a>
          <ThemeSwitcher />
          <AlertCentreButton services={services} />
          <KillSwitchButton />
          <span className="tabular-nums text-gray-500">{time.value}</span>
          {user && (
            <div className="flex items-center gap-2 pl-3 border-l border-gray-800">
              <span className="flex items-center gap-1.5 text-gray-400">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold tracking-wide ${
                    user.role === "admin"
                      ? "bg-orange-900/60 text-orange-300"
                      : "bg-gray-700 text-gray-200"
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
                className="text-gray-600 hover:text-gray-300 transition-colors text-[10px] leading-none px-1.5 py-0.5 border border-gray-700 hover:border-gray-500 rounded"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WorkspaceToolbar: layout controls scoped to the active workspace ─────────

export function WorkspaceToolbar() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-950 border-b border-gray-800 text-xs">
      <ComponentPicker />
      <div className="w-px h-3.5 bg-gray-800" />
      <TemplatePicker />
    </div>
  );
}

// ─── StatusBar: kept for backwards-compat imports in tests ────────────────────

export function StatusBar() {
  return (
    <>
      <AppHeader />
      <WorkspaceToolbar />
    </>
  );
}
