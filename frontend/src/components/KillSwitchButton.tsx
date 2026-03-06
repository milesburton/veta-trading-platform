import { useSignal } from "@preact/signals-react";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import type { KillOrdersPayload, KillScope, ResumeOrdersPayload } from "../store/ordersSlice.ts";
import { killOrdersThunk, resumeOrdersThunk } from "../store/ordersSlice.ts";

type DialogTab = "kill" | "resume";

interface KillConfig {
  scope: KillScope;
  scopeValue: string;
  targetUserId: string;
  resumeMode: "immediate" | "scheduled";
  resumeMinutes: string;
}

const RESUME_PRESETS = [5, 15, 30, 60] as const;

const SCOPE_LABELS: Record<KillScope, string> = {
  all: "All",
  user: "User",
  algo: "Algorithm",
  market: "Market",
  symbol: "Symbol",
};

const LABEL_CLS = "text-gray-500 uppercase text-[10px] font-semibold tracking-wide";
const INPUT_CLS =
  "bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-gray-500 font-mono text-xs w-full";

export function KillSwitchButton() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === "admin";

  const open = useSignal(false);
  const tab = useSignal<DialogTab>("kill");
  const confirmed = useSignal(false);
  const isSending = useSignal(false);

  const cfg = useSignal<KillConfig>({
    scope: "all",
    scopeValue: "",
    targetUserId: "",
    resumeMode: "immediate",
    resumeMinutes: "",
  });

  if (!user) return null;

  function resetAndOpen() {
    cfg.value = {
      scope: "all",
      scopeValue: "",
      targetUserId: "",
      resumeMode: "immediate",
      resumeMinutes: "",
    };
    confirmed.value = false;
    isSending.value = false;
    open.value = true;
  }

  function close() {
    open.value = false;
    confirmed.value = false;
  }

  function switchTab(t: DialogTab) {
    tab.value = t;
    confirmed.value = false;
  }

  function setScope(s: KillScope) {
    cfg.value = { ...cfg.value, scope: s, scopeValue: "", targetUserId: "" };
    confirmed.value = false;
  }

  async function handleConfirm() {
    if (!confirmed.value) return;
    isSending.value = true;
    try {
      const { scope, scopeValue, targetUserId, resumeMode, resumeMinutes } = cfg.value;
      if (tab.value === "kill") {
        const payload: KillOrdersPayload = { scope };
        if (scope !== "all" && scopeValue) payload.scopeValue = scopeValue;
        if (scope === "user" && isAdmin && targetUserId) payload.targetUserId = targetUserId;
        await dispatch(killOrdersThunk(payload));
      } else {
        const payload: ResumeOrdersPayload = { scope };
        if (scope !== "all" && scopeValue) payload.scopeValue = scopeValue;
        if (scope === "user" && isAdmin && targetUserId) payload.targetUserId = targetUserId;
        if (resumeMode === "scheduled" && resumeMinutes) {
          payload.resumeAt = Date.now() + Number(resumeMinutes) * 60_000;
        }
        await dispatch(resumeOrdersThunk(payload));
      }
      close();
    } finally {
      isSending.value = false;
    }
  }

  const scopeNeedsValue =
    cfg.value.scope === "algo" || cfg.value.scope === "market" || cfg.value.scope === "symbol";
  const canSubmit = confirmed.value && (!scopeNeedsValue || cfg.value.scopeValue.trim() !== "");
  const isKill = tab.value === "kill";

  return (
    <>
      <button
        type="button"
        onClick={resetAndOpen}
        title="Kill switch — cancel or resume active orders"
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-red-700 bg-red-950/60 text-red-400 hover:bg-red-900/70 hover:border-red-500 hover:text-red-300 transition-colors text-[11px] font-semibold tracking-wide"
        aria-label="Open kill switch"
      >
        <span aria-hidden="true">⚠</span>
        Kill Switch
      </button>

      {open.value && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Kill Switch"
            className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[440px] max-w-[95vw] text-xs text-gray-300"
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-red-900/60 bg-red-950/30">
              <span className="text-red-400 text-sm" aria-hidden="true">
                ⚠
              </span>
              <span className="font-bold uppercase tracking-widest text-[11px] text-red-400">
                Kill Switch
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="ml-auto text-gray-600 hover:text-gray-300"
              >
                ✕
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-gray-800">
              {(["kill", "resume"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                    tab.value === t
                      ? t === "kill"
                        ? "text-red-400 border-b-2 border-red-500"
                        : "text-emerald-400 border-b-2 border-emerald-500"
                      : "text-gray-600 hover:text-gray-400"
                  }`}
                >
                  {t === "kill" ? "Cancel Orders" : "Resume Orders"}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="px-4 py-4 flex flex-col gap-4">
              {/* Scope selector */}
              <fieldset>
                <legend className={LABEL_CLS}>Scope</legend>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(Object.keys(SCOPE_LABELS) as KillScope[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScope(s)}
                      aria-pressed={cfg.value.scope === s}
                      className={`px-2.5 py-1 rounded border text-[11px] transition-colors ${
                        cfg.value.scope === s
                          ? isKill
                            ? "border-red-600 bg-red-900/40 text-red-300"
                            : "border-emerald-600 bg-emerald-900/30 text-emerald-300"
                          : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {SCOPE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Scope value */}
              {cfg.value.scope === "algo" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="ks-algo" className={LABEL_CLS}>
                    Algorithm
                  </label>
                  <select
                    id="ks-algo"
                    value={cfg.value.scopeValue}
                    onChange={(e) => {
                      cfg.value = {
                        ...cfg.value,
                        scopeValue: (e.target as HTMLSelectElement).value,
                      };
                      confirmed.value = false;
                    }}
                    className={INPUT_CLS}
                  >
                    <option value="">— select algo —</option>
                    {["LIMIT", "TWAP", "POV", "VWAP"].map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {cfg.value.scope === "symbol" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="ks-symbol" className={LABEL_CLS}>
                    Symbol
                  </label>
                  <input
                    id="ks-symbol"
                    type="text"
                    placeholder="e.g. AAPL"
                    value={cfg.value.scopeValue}
                    onInput={(e) => {
                      cfg.value = {
                        ...cfg.value,
                        scopeValue: (e.target as HTMLInputElement).value.toUpperCase(),
                      };
                      confirmed.value = false;
                    }}
                    className={INPUT_CLS}
                  />
                </div>
              )}

              {cfg.value.scope === "market" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="ks-market" className={LABEL_CLS}>
                    Market / Exchange
                  </label>
                  <input
                    id="ks-market"
                    type="text"
                    placeholder="e.g. XNAS"
                    value={cfg.value.scopeValue}
                    onInput={(e) => {
                      cfg.value = {
                        ...cfg.value,
                        scopeValue: (e.target as HTMLInputElement).value.toUpperCase(),
                      };
                      confirmed.value = false;
                    }}
                    className={INPUT_CLS}
                  />
                </div>
              )}

              {cfg.value.scope === "user" && isAdmin && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="ks-target-user" className={LABEL_CLS}>
                    Target user ID <span className="normal-case text-orange-400">(admin only)</span>
                  </label>
                  <input
                    id="ks-target-user"
                    type="text"
                    placeholder="leave blank to target your own orders"
                    value={cfg.value.targetUserId}
                    onInput={(e) => {
                      cfg.value = {
                        ...cfg.value,
                        targetUserId: (e.target as HTMLInputElement).value,
                      };
                      confirmed.value = false;
                    }}
                    className={INPUT_CLS}
                  />
                </div>
              )}

              {/* Resume timing — resume tab only */}
              {tab.value === "resume" && (
                <fieldset>
                  <legend className={LABEL_CLS}>Resume timing</legend>
                  <div className="flex gap-2 mt-1.5">
                    {(["immediate", "scheduled"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          cfg.value = { ...cfg.value, resumeMode: m };
                        }}
                        aria-pressed={cfg.value.resumeMode === m}
                        className={`px-2.5 py-1 rounded border text-[11px] capitalize transition-colors ${
                          cfg.value.resumeMode === m
                            ? "border-emerald-600 bg-emerald-900/30 text-emerald-300"
                            : "border-gray-700 text-gray-500 hover:border-gray-500"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  {cfg.value.resumeMode === "scheduled" && (
                    <div className="flex gap-1.5 flex-wrap mt-2">
                      {RESUME_PRESETS.map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            cfg.value = { ...cfg.value, resumeMinutes: String(mins) };
                            confirmed.value = false;
                          }}
                          aria-pressed={cfg.value.resumeMinutes === String(mins)}
                          className={`px-2 py-1 rounded border text-[11px] transition-colors ${
                            cfg.value.resumeMinutes === String(mins)
                              ? "border-emerald-600 bg-emerald-900/30 text-emerald-300"
                              : "border-gray-700 text-gray-500 hover:border-gray-500"
                          }`}
                        >
                          {mins < 60 ? `${mins}m` : "1h"}
                        </button>
                      ))}
                      <label htmlFor="ks-resume-custom" className="sr-only">
                        Custom minutes
                      </label>
                      <input
                        id="ks-resume-custom"
                        type="number"
                        min="1"
                        placeholder="custom min"
                        value={cfg.value.resumeMinutes}
                        onInput={(e) => {
                          cfg.value = {
                            ...cfg.value,
                            resumeMinutes: (e.target as HTMLInputElement).value,
                          };
                          confirmed.value = false;
                        }}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-gray-500 w-24 text-[11px]"
                      />
                    </div>
                  )}
                </fieldset>
              )}

              {/* Summary banner */}
              <div
                className={`rounded px-3 py-2 text-[11px] ${
                  isKill
                    ? "bg-red-950/40 border border-red-900/60 text-red-300"
                    : "bg-emerald-950/30 border border-emerald-900/40 text-emerald-400"
                }`}
              >
                {isKill ? (
                  <>
                    This will <strong>immediately cancel</strong> all{" "}
                    {cfg.value.scope === "all"
                      ? "active orders"
                      : `${SCOPE_LABELS[cfg.value.scope].toLowerCase()} orders${cfg.value.scopeValue ? ` (${cfg.value.scopeValue})` : ""}`}
                    . This action is logged for regulatory purposes.
                  </>
                ) : (
                  <>
                    This will resume{" "}
                    {cfg.value.scope === "all"
                      ? "all"
                      : SCOPE_LABELS[cfg.value.scope].toLowerCase()}{" "}
                    previously cancelled orders
                    {cfg.value.resumeMode === "scheduled" && cfg.value.resumeMinutes
                      ? ` in ${cfg.value.resumeMinutes} minute(s)`
                      : " immediately"}
                    . This action is logged for regulatory purposes.
                  </>
                )}
              </div>

              {/* Confirmation */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmed.value}
                  onChange={(e) => {
                    confirmed.value = (e.target as HTMLInputElement).checked;
                  }}
                  className="w-3.5 h-3.5 accent-red-500"
                />
                <span className="text-gray-400">
                  I confirm this action and understand it will be audited
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-800">
              <button
                type="button"
                onClick={close}
                className="px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors text-[11px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleConfirm().catch(() => {});
                }}
                disabled={!canSubmit || isSending.value}
                className={`px-4 py-1.5 rounded border font-semibold text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isKill
                    ? "border-red-600 bg-red-700 hover:bg-red-600 text-white"
                    : "border-emerald-600 bg-emerald-800 hover:bg-emerald-700 text-white"
                }`}
              >
                {isSending.value ? "Sending…" : isKill ? "Confirm Cancel" : "Confirm Resume"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
