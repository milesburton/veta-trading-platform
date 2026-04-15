import { useSignal } from "@preact/signals-react";
import type { AlertSeverity, AlertSource, MuteRule } from "../store/alertsSlice.ts";
import {
  alertAdded,
  allMuteRulesCleared,
  muteRuleRemoved,
  selectMuteRules,
} from "../store/alertsSlice.ts";
import { useRunDemoDayMutation, useRunLoadTestMutation } from "../store/gatewayApi.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";

const ALERT_SEVERITIES: AlertSeverity[] = ["CRITICAL", "WARNING", "INFO"];
const ALERT_SOURCES: AlertSource[] = ["kill-switch", "service", "algo", "order", "workspace"];

const PRESET_ALERTS: {
  label: string;
  severity: AlertSeverity;
  source: AlertSource;
  message: string;
  detail?: string;
}[] = [
  {
    label: "Exchange Offline",
    severity: "CRITICAL",
    source: "service",
    message: "FIX Exchange connection lost — no executions possible",
    detail: "TCP 9880 unreachable",
  },
  {
    label: "Kill Switch Activated",
    severity: "CRITICAL",
    source: "kill-switch",
    message: "Kill switch activated — all orders halted",
    detail: "Issued by admin",
  },
  {
    label: "Algo Heartbeat Lost",
    severity: "WARNING",
    source: "algo",
    message: "TWAP strategy heartbeat lost for AAPL",
    detail: "No heartbeat in 30s",
  },
  {
    label: "Order Rejected",
    severity: "WARNING",
    source: "order",
    message: "Order rejected: notional exceeds user limit",
  },
  {
    label: "Workspace Saved",
    severity: "INFO",
    source: "workspace",
    message: "Workspace layout saved successfully",
  },
  {
    label: "Service Recovered",
    severity: "INFO",
    source: "service",
    message: "OMS recovered — order routing restored",
  },
];

const QUICK_TRADES = [
  { label: "Standard Day", scenario: "standard" },
  { label: "Market Open", scenario: "market-open" },
  { label: "Volatile Session", scenario: "volatile" },
  { label: "Institutional Flow", scenario: "institutional" },
];

function SectionHeader({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
      {children}
    </div>
  );
}

function MuteRuleRow({ rule, onRemove }: { rule: MuteRule; onRemove: () => void }) {
  const parts: string[] = [];
  if (rule.severity) parts.push(rule.severity);
  if (rule.source) parts.push(rule.source);
  if (rule.messageContains) parts.push(`"${rule.messageContains}"`);
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] text-gray-400 font-mono">{parts.join(" + ") || "all"}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-[9px] text-gray-600 hover:text-red-400 transition-colors"
      >
        ×
      </button>
    </div>
  );
}

export function DevToolsPanel() {
  const dispatch = useAppDispatch();
  const muteRules = useAppSelector(selectMuteRules);
  const user = useAppSelector((s) => s.auth.user);
  const wsConnected = useAppSelector((s) => s.market.connected);

  const customSeverity = useSignal<AlertSeverity>("WARNING");
  const customSource = useSignal<AlertSource>("service");
  const customMessage = useSignal("Test alert from DevTools");
  const customDetail = useSignal("");

  const tradeResult = useSignal<string | null>(null);
  const loadCount = useSignal(50);
  const loadStrategy = useSignal("LIMIT");

  const [runDemoDay, { isLoading: isDemoRunning }] = useRunDemoDayMutation();
  const [runLoadTest, { isLoading: isLoadRunning }] = useRunLoadTestMutation();

  function fireCustomAlert() {
    dispatch(
      alertAdded({
        severity: customSeverity.value,
        source: customSource.value,
        message: customMessage.value,
        detail: customDetail.value || undefined,
        ts: Date.now(),
      })
    );
  }

  async function fireQuickTrade(scenario: string) {
    tradeResult.value = null;
    const res = await runDemoDay({ scenario });
    if ("data" in res) {
      tradeResult.value = `Injected ${(res.data as { submitted: number }).submitted} orders (${scenario})`;
    } else {
      tradeResult.value = "Failed — check gateway connection";
    }
  }

  async function fireLoadTest() {
    tradeResult.value = null;
    const res = await runLoadTest({
      orderCount: loadCount.value,
      strategy: loadStrategy.value,
      symbols: ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"],
    });
    if ("data" in res) {
      tradeResult.value = `Load test: ${(res.data as { submitted: number }).submitted} ${loadStrategy.value} orders submitted`;
    } else {
      tradeResult.value = "Load test failed";
    }
  }

  return (
    <div
      className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs overflow-hidden"
      data-testid="dev-tools-panel"
    >
      <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
            Dev Tools
          </span>
          <span className="text-[10px] text-gray-600">Homelab debugging and simulation</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        <section>
          <SectionHeader>Preset Alerts</SectionHeader>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESET_ALERTS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  dispatch(
                    alertAdded({
                      severity: preset.severity,
                      source: preset.source,
                      message: preset.message,
                      detail: preset.detail,
                      ts: Date.now(),
                    })
                  )
                }
                className={`text-left text-[10px] px-2 py-1.5 rounded border transition-colors ${
                  preset.severity === "CRITICAL"
                    ? "border-red-800/50 bg-red-950/30 text-red-300 hover:bg-red-900/40"
                    : preset.severity === "WARNING"
                      ? "border-amber-800/50 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40"
                      : "border-blue-800/50 bg-blue-950/30 text-blue-300 hover:bg-blue-900/40"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader>Custom Alert</SectionHeader>
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={customSeverity.value}
                onChange={(e) => {
                  customSeverity.value = e.target.value as AlertSeverity;
                }}
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300"
              >
                {ALERT_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={customSource.value}
                onChange={(e) => {
                  customSource.value = e.target.value as AlertSource;
                }}
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300"
              >
                {ALERT_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={customMessage.value}
              onChange={(e) => {
                customMessage.value = e.target.value;
              }}
              placeholder="Alert message"
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 placeholder-gray-600"
            />
            <input
              type="text"
              value={customDetail.value}
              onChange={(e) => {
                customDetail.value = e.target.value;
              }}
              placeholder="Detail (optional)"
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 placeholder-gray-600"
            />
            <button
              type="button"
              onClick={fireCustomAlert}
              className="w-full px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-white text-[10px] font-semibold transition-colors"
            >
              Fire Alert
            </button>
          </div>
        </section>

        <section>
          <SectionHeader>{`Mute Rules (${muteRules.length})`}</SectionHeader>
          {muteRules.length === 0 ? (
            <div className="text-[10px] text-gray-600">
              No mute rules — use the diamond button on alert rows to mute similar alerts
            </div>
          ) : (
            <div className="space-y-0.5">
              {muteRules.map((rule) => (
                <MuteRuleRow
                  key={rule.id}
                  rule={rule}
                  onRemove={() => dispatch(muteRuleRemoved(rule.id))}
                />
              ))}
              <button
                type="button"
                onClick={() => dispatch(allMuteRulesCleared())}
                className="text-[9px] text-gray-600 hover:text-gray-400 mt-1 transition-colors"
              >
                Clear all rules
              </button>
            </div>
          )}
        </section>

        <section>
          <SectionHeader>Quick Trade Injection</SectionHeader>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_TRADES.map((qt) => (
              <button
                key={qt.scenario}
                type="button"
                disabled={isDemoRunning}
                onClick={() => fireQuickTrade(qt.scenario)}
                className="text-[10px] px-2 py-1.5 rounded border border-emerald-800/50 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
              >
                {qt.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader>Load Test</SectionHeader>
          <div className="flex gap-2 items-end">
            <label className="flex-1">
              <span className="text-[9px] text-gray-500 block mb-0.5">Orders</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={loadCount.value}
                onChange={(e) => {
                  loadCount.value = Number(e.target.value);
                }}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 tabular-nums"
              />
            </label>
            <label className="flex-1">
              <span className="text-[9px] text-gray-500 block mb-0.5">Strategy</span>
              <select
                value={loadStrategy.value}
                onChange={(e) => {
                  loadStrategy.value = e.target.value;
                }}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300"
              >
                {["LIMIT", "TWAP", "VWAP", "POV", "ICEBERG", "SNIPER"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={isLoadRunning}
              onClick={fireLoadTest}
              className="px-3 py-1.5 rounded bg-violet-700 hover:bg-violet-600 text-white text-[10px] font-semibold transition-colors disabled:opacity-50"
            >
              Run
            </button>
          </div>
        </section>

        {tradeResult.value && (
          <div className="rounded border border-gray-700 bg-gray-900/50 px-3 py-2 text-[10px] text-gray-400">
            {tradeResult.value}
          </div>
        )}

        <section>
          <SectionHeader>Connection State</SectionHeader>
          <div className="space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">WebSocket</span>
              <span className={wsConnected ? "text-emerald-400" : "text-red-400"}>
                {wsConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">User</span>
              <span className="text-gray-300 font-mono">
                {user ? `${user.name} (${user.role})` : "Not authenticated"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Active Mute Rules</span>
              <span className="text-gray-300 tabular-nums">{muteRules.length}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
