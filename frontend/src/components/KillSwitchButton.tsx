import { useSignal } from "@preact/signals-react";
import { v4 as uuidv4 } from "uuid";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import type { KillBlock } from "../store/killSwitchSlice.ts";
import { blockAdded, blockRemoved } from "../store/killSwitchSlice.ts";
import type { KillOrdersPayload, KillScope, ResumeOrdersPayload } from "../store/ordersSlice.ts";
import { killOrdersThunk, resumeOrdersThunk } from "../store/ordersSlice.ts";

type DialogTab = "kill" | "resume";

const ALGOS = ["LIMIT", "TWAP", "POV", "VWAP"] as const;

const SCOPE_META: Record<KillScope, { label: string; hasValues: boolean; placeholder?: string }> = {
  all: { label: "All orders", hasValues: false },
  user: { label: "By user", hasValues: false },
  algo: { label: "By algorithm", hasValues: true },
  symbol: { label: "By symbol", hasValues: true, placeholder: "Filter symbols…" },
  market: { label: "By market/exchange", hasValues: true, placeholder: "e.g. XNAS" },
};

const RESUME_PRESETS = [5, 15, 30, 60] as const;

const LABEL_CLS = "text-gray-500 uppercase text-[10px] font-semibold tracking-wide";
const INPUT_CLS =
  "bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-gray-500 text-xs w-full";

function MultiSelectGrid({
  items,
  selected,
  onToggle,
  filterPlaceholder,
}: {
  items: string[];
  selected: Set<string>;
  onToggle: (item: string) => void;
  filterPlaceholder?: string;
}) {
  const filter = useSignal("");
  const filtered = items.filter((i) => i.toLowerCase().includes(filter.value.toLowerCase()));

  return (
    <div className="flex flex-col gap-1">
      {items.length > 6 && filterPlaceholder && (
        <input
          type="text"
          placeholder={filterPlaceholder}
          value={filter.value}
          onInput={(e) => {
            filter.value = (e.target as HTMLInputElement).value;
          }}
          className={INPUT_CLS}
          aria-label={filterPlaceholder}
        />
      )}
      <div className="max-h-36 overflow-y-auto border border-gray-700 rounded bg-gray-800/50">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-gray-600 text-[11px]">No items</div>
        ) : (
          filtered.map((item) => (
            <label
              key={item}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700/40 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={selected.has(item)}
                onChange={() => onToggle(item)}
                className="w-3 h-3 accent-red-500"
              />
              <span className="font-mono text-[11px] text-gray-300">{item}</span>
            </label>
          ))
        )}
      </div>
      {selected.size > 0 && (
        <div className="text-[10px] text-gray-500">{selected.size} selected</div>
      )}
    </div>
  );
}

function ActiveBlockRow({ block, onRemove }: { block: KillBlock; onRemove: () => void }) {
  const scopeLabel = SCOPE_META[block.scope].label;
  const vals = block.scopeValues.length > 0 ? block.scopeValues.join(", ") : null;

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-red-950/40 border border-red-900/40">
      <span className="text-red-400 text-[10px] font-semibold uppercase shrink-0">
        {scopeLabel}
      </span>
      {vals && <span className="font-mono text-[10px] text-gray-400 truncate">{vals}</span>}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove block"
        className="ml-auto text-gray-600 hover:text-red-400 transition-colors text-[11px] shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

export function KillSwitchButton() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === "admin";
  const symbols = useAppSelector((s) => s.market.assets.map((a) => a.symbol));
  const seenUsers = useAppSelector(
    (s) => [...new Set(s.orders.orders.map((o) => o.userId).filter(Boolean))] as string[]
  );
  const blocks = useAppSelector((s) => s.killSwitch.blocks);

  const open = useSignal(false);
  const tab = useSignal<DialogTab>("kill");
  const scope = useSignal<KillScope>("all");
  const selectedValues = useSignal<Set<string>>(new Set());
  const targetUserId = useSignal("");
  const resumeMode = useSignal<"immediate" | "scheduled">("immediate");
  const resumeMinutes = useSignal("");
  const confirmed = useSignal(false);
  const isSending = useSignal(false);

  if (!user) return null;

  const activeCount = blocks.length;

  function resetAndOpen() {
    scope.value = "all";
    selectedValues.value = new Set();
    targetUserId.value = "";
    resumeMode.value = "immediate";
    resumeMinutes.value = "";
    confirmed.value = false;
    isSending.value = false;
    tab.value = "kill";
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
    scope.value = s;
    selectedValues.value = new Set();
    confirmed.value = false;
  }

  function toggleValue(v: string) {
    const next = new Set(selectedValues.value);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    selectedValues.value = next;
    confirmed.value = false;
  }

  async function handleConfirm() {
    if (!confirmed.value) return;
    isSending.value = true;
    try {
      const scopeVals = [...selectedValues.value];
      if (tab.value === "kill") {
        for (const val of scopeVals.length > 0 ? scopeVals : [undefined]) {
          const payload: KillOrdersPayload = { scope: scope.value };
          if (val) payload.scopeValue = val;
          if (scope.value === "user" && isAdmin && targetUserId.value)
            payload.targetUserId = targetUserId.value;
          await dispatch(killOrdersThunk(payload));
        }
        // Optimistic local block
        dispatch(
          blockAdded({
            id: uuidv4(),
            scope: scope.value,
            scopeValues: scopeVals,
            targetUserId:
              scope.value === "user" && isAdmin ? targetUserId.value || undefined : undefined,
            issuedBy: user?.id ?? "unknown",
            issuedAt: Date.now(),
          })
        );
      } else {
        const payload: ResumeOrdersPayload = { scope: scope.value };
        if (scopeVals.length > 0) payload.scopeValue = scopeVals[0];
        if (scope.value === "user" && isAdmin && targetUserId.value)
          payload.targetUserId = targetUserId.value;
        if (resumeMode.value === "scheduled" && resumeMinutes.value) {
          payload.resumeAt = Date.now() + Number(resumeMinutes.value) * 60_000;
        }
        await dispatch(resumeOrdersThunk(payload));
        // Clear local blocks (server will send resumeAck which also clears)
        dispatch({ type: "killSwitch/allBlocksCleared" });
      }
      close();
    } finally {
      isSending.value = false;
    }
  }

  const meta = SCOPE_META[scope.value];
  const needsValues = meta.hasValues;
  const canSubmit = confirmed.value && (!needsValues || selectedValues.value.size > 0);
  const isKill = tab.value === "kill";

  const scopeItems: string[] =
    scope.value === "algo"
      ? [...ALGOS]
      : scope.value === "symbol"
        ? symbols
        : scope.value === "user"
          ? seenUsers
          : [];

  return (
    <>
      {/* ── Header button ── */}
      <button
        type="button"
        onClick={resetAndOpen}
        title={
          activeCount > 0
            ? `Kill switch active — ${activeCount} block(s)`
            : "Kill switch — cancel or resume active orders"
        }
        className={`flex items-center gap-1.5 px-2 py-1 rounded border font-semibold text-[11px] tracking-wide transition-all ${
          activeCount > 0
            ? "border-red-500 bg-red-600 text-white animate-pulse"
            : "border-red-700 bg-red-950/60 text-red-400 hover:bg-red-900/70 hover:border-red-500 hover:text-red-300"
        }`}
        aria-label={
          activeCount > 0 ? `Kill switch active, ${activeCount} block(s)` : "Open kill switch"
        }
      >
        <span aria-hidden="true">{activeCount > 0 ? "!" : "⚠"}</span>
        Kill Switch
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-red-700 text-[9px] font-bold leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {/* ── Dialog ── */}
      {open.value && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Kill Switch"
            className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[480px] max-w-[95vw] text-xs text-gray-300 flex flex-col max-h-[90vh]"
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-red-900/60 bg-red-950/30 shrink-0">
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

            {/* Active blocks */}
            {blocks.length > 0 && (
              <div className="px-4 py-3 border-b border-gray-800 shrink-0">
                <div className={`${LABEL_CLS} mb-2`}>Active blocks</div>
                <div className="flex flex-col gap-1">
                  {blocks.map((b) => (
                    <ActiveBlockRow
                      key={b.id}
                      block={b}
                      onRemove={() => dispatch(blockRemoved({ id: b.id }))}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex border-b border-gray-800 shrink-0">
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

            {/* Scrollable body */}
            <div className="px-4 py-4 flex flex-col gap-4 overflow-y-auto">
              {/* Scope pills */}
              <fieldset>
                <legend className={LABEL_CLS}>Scope</legend>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(Object.keys(SCOPE_META) as KillScope[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScope(s)}
                      aria-pressed={scope.value === s}
                      className={`px-2.5 py-1 rounded border text-[11px] transition-colors ${
                        scope.value === s
                          ? isKill
                            ? "border-red-600 bg-red-900/40 text-red-300"
                            : "border-emerald-600 bg-emerald-900/30 text-emerald-300"
                          : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {SCOPE_META[s].label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Multi-select grid for algos / symbols */}
              {(scope.value === "algo" || scope.value === "symbol") && (
                <div className="flex flex-col gap-1">
                  <span className={LABEL_CLS}>
                    {scope.value === "algo" ? "Algorithms" : "Symbols"}
                  </span>
                  <MultiSelectGrid
                    items={scopeItems}
                    selected={selectedValues.value}
                    onToggle={toggleValue}
                    filterPlaceholder={meta.placeholder}
                  />
                </div>
              )}

              {/* Market text input with multi-entry */}
              {scope.value === "market" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="ks-market" className={LABEL_CLS}>
                    Market / Exchange
                  </label>
                  <input
                    id="ks-market"
                    type="text"
                    placeholder="e.g. XNAS (press Enter to add)"
                    className={INPUT_CLS}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = (e.target as HTMLInputElement).value.trim().toUpperCase();
                        if (val) {
                          toggleValue(val);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                  {selectedValues.value.size > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {[...selectedValues.value].map((v) => (
                        <span
                          key={v}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-mono text-[10px]"
                        >
                          {v}
                          <button
                            type="button"
                            onClick={() => toggleValue(v)}
                            aria-label={`Remove ${v}`}
                            className="text-gray-500 hover:text-red-400"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Admin user selector */}
              {scope.value === "user" && (
                <div className="flex flex-col gap-1">
                  <span className={LABEL_CLS}>
                    User
                    {isAdmin && (
                      <span className="normal-case text-orange-400 ml-1">
                        (admin: target any user)
                      </span>
                    )}
                  </span>
                  {seenUsers.length > 0 ? (
                    <MultiSelectGrid
                      items={seenUsers}
                      selected={selectedValues.value}
                      onToggle={toggleValue}
                    />
                  ) : isAdmin ? (
                    <>
                      <label htmlFor="ks-target-user" className="sr-only">
                        Target user ID
                      </label>
                      <input
                        id="ks-target-user"
                        type="text"
                        placeholder="Enter user ID"
                        value={targetUserId.value}
                        onInput={(e) => {
                          targetUserId.value = (e.target as HTMLInputElement).value;
                          confirmed.value = false;
                        }}
                        className={INPUT_CLS}
                      />
                    </>
                  ) : (
                    <div className="text-gray-600 text-[11px]">Your orders will be targeted</div>
                  )}
                </div>
              )}

              {/* Resume timing */}
              {tab.value === "resume" && (
                <fieldset>
                  <legend className={LABEL_CLS}>Resume timing</legend>
                  <div className="flex gap-2 mt-1.5">
                    {(["immediate", "scheduled"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          resumeMode.value = m;
                        }}
                        aria-pressed={resumeMode.value === m}
                        className={`px-2.5 py-1 rounded border text-[11px] capitalize transition-colors ${
                          resumeMode.value === m
                            ? "border-emerald-600 bg-emerald-900/30 text-emerald-300"
                            : "border-gray-700 text-gray-500 hover:border-gray-500"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  {resumeMode.value === "scheduled" && (
                    <div className="flex gap-1.5 flex-wrap mt-2">
                      {RESUME_PRESETS.map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            resumeMinutes.value = String(mins);
                            confirmed.value = false;
                          }}
                          aria-pressed={resumeMinutes.value === String(mins)}
                          className={`px-2 py-1 rounded border text-[11px] transition-colors ${
                            resumeMinutes.value === String(mins)
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
                        value={resumeMinutes.value}
                        onInput={(e) => {
                          resumeMinutes.value = (e.target as HTMLInputElement).value;
                          confirmed.value = false;
                        }}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-gray-500 w-24 text-[11px]"
                      />
                    </div>
                  )}
                </fieldset>
              )}

              {/* Summary */}
              <div
                className={`rounded px-3 py-2 text-[11px] ${
                  isKill
                    ? "bg-red-950/40 border border-red-900/60 text-red-300"
                    : "bg-emerald-950/30 border border-emerald-900/40 text-emerald-400"
                }`}
              >
                {isKill ? (
                  <>
                    This will <strong>immediately cancel</strong> and <strong>block</strong>{" "}
                    {scope.value === "all"
                      ? "all active orders"
                      : `${SCOPE_META[scope.value].label.toLowerCase()} orders${selectedValues.value.size > 0 ? ` (${[...selectedValues.value].join(", ")})` : ""}`}
                    . New matching orders will be blocked until resumed. This action is logged for
                    regulatory purposes.
                  </>
                ) : (
                  <>
                    This will lift blocks and allow orders to resume
                    {resumeMode.value === "scheduled" && resumeMinutes.value
                      ? ` in ${resumeMinutes.value} minute(s)`
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
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-800 shrink-0">
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
