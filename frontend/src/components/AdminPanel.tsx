import { useSignal } from "@preact/signals-react";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import type { UserLimits, UserRow } from "@veta/frontend/store/userApi.ts";
import {
  useGetUserLimitsQuery,
  useGetUsersQuery,
  useUpdateUserLimitsMutation,
} from "@veta/frontend/store/userApi.ts";
import { formatUtcTime } from "@veta/frontend/utils/clock.ts";
import { useEffect } from "react";

interface JournalEntry {
  id: number;
  event_type: string;
  ts: number;
  algo: string | null;
  instrument: string | null;
  side: string | null;
  order_id: string | null;
  quantity: number | null;
  limit_price: number | null;
  fill_price: number | null;
  filled_qty: number | null;
  market_price: number | null;
}

const ALL_STRATEGIES = ["LIMIT", "TWAP", "POV", "VWAP"];

interface UserLimitsRowProps {
  user: UserRow;
  isAdmin: boolean;
  idx: number;
}

function UserLimitsRow({ user, isAdmin, idx }: UserLimitsRowProps) {
  const { data: serverLimits } = useGetUserLimitsQuery(user.id);
  const [updateLimits, { isLoading: saving, error: saveError }] = useUpdateUserLimitsMutation();
  const localLimits = useSignal<UserLimits | null>(null);

  const lim = localLimits.value ?? serverLimits ?? null;

  function toggleStrategy(strategy: string) {
    if (!lim) return;
    const current = lim.allowed_strategies;
    const updated = current.includes(strategy)
      ? current.filter((s) => s !== strategy)
      : [...current, strategy];
    localLimits.value = { ...lim, allowed_strategies: updated };
  }

  async function saveLimitsHandler() {
    if (!lim) return;
    await updateLimits({
      userId: user.id,
      max_order_qty: lim.max_order_qty,
      max_daily_notional: lim.max_daily_notional,
      allowed_strategies: lim.allowed_strategies,
    });
    localLimits.value = null;
  }

  return (
    <>
      <tr
        key={user.id}
        data-testid="user-row"
        className={`border-t border-panel ${idx % 2 === 0 ? "bg-page" : "bg-surface/40"}`}
      >
        <td className="px-3 py-2">
          <span className="mr-1">{user.avatar_emoji}</span>
          <span className="text-secondary">{user.name}</span>
          <span
            className={`ml-1.5 text-[9px] px-1 py-0.5 rounded ${
              user.role === "admin"
                ? "bg-orange-900/50 text-orange-400"
                : "bg-blue-900/50 text-blue-400"
            }`}
          >
            {user.role}
          </span>
        </td>
        <td className="px-3 py-2">
          {lim ? (
            <input
              type="number"
              value={lim.max_order_qty}
              disabled={!isAdmin}
              onChange={(e) => {
                localLimits.value = {
                  ...(localLimits.value ?? lim),
                  max_order_qty: Number(e.target.value),
                };
              }}
              className="w-24 bg-panel border border-divider rounded px-2 py-0.5 text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            />
          ) : (
            <span className="text-subtle">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          {lim ? (
            <input
              type="number"
              value={lim.max_daily_notional}
              disabled={!isAdmin}
              onChange={(e) => {
                localLimits.value = {
                  ...(localLimits.value ?? lim),
                  max_daily_notional: Number(e.target.value),
                };
              }}
              className="w-28 bg-panel border border-divider rounded px-2 py-0.5 text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            />
          ) : (
            <span className="text-subtle">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          {lim ? (
            <div className="flex gap-1">
              {ALL_STRATEGIES.map((s) => {
                const enabled = lim.allowed_strategies.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => toggleStrategy(s)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors disabled:cursor-not-allowed ${
                      enabled
                        ? "bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900"
                        : "bg-panel text-subtle hover:bg-divider"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-subtle">—</span>
          )}
        </td>
        {isAdmin && (
          <td className="px-3 py-2">
            <button
              type="button"
              disabled={saving || !lim}
              onClick={saveLimitsHandler}
              className="px-2 py-0.5 bg-emerald-800/60 text-emerald-400 hover:bg-emerald-800 rounded text-[10px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </td>
        )}
      </tr>
      {saveError && (
        <tr>
          <td colSpan={isAdmin ? 5 : 4} className="px-3 py-1 text-red-400 text-[10px]">
            {"status" in saveError ? `Save failed (${saveError.status})` : "Save failed"}
          </td>
        </tr>
      )}
    </>
  );
}

export function AdminPanel() {
  const currentUser = useAppSelector((s) => s.auth.user);
  const { data: users = [] } = useGetUsersQuery();
  const journal = useSignal<JournalEntry[]>([]);

  useEffect(() => {
    fetch("/api/gateway/api/journal/journal?limit=50", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { entries: JournalEntry[] }) => {
        journal.value = data.entries ?? [];
      })
      .catch(() => {});
  }, [journal]);

  const isAdmin = currentUser?.role === "admin";
  const traderUsers = users.filter((u) => u.role !== "admin");

  return (
    <div data-testid="admin-panel" className="h-full overflow-auto p-3 space-y-4 text-xs">
      {/* Trading Limits table */}
      <div>
        <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
          Trading Limits
          {!isAdmin && (
            <span className="ml-2 text-orange-400">
              (read-only — mission control access required to edit)
            </span>
          )}
        </div>
        <div className="border border-panel rounded overflow-hidden">
          <table data-testid="users-table" className="w-full text-left">
            <thead>
              <tr className="bg-surface text-muted text-[10px] uppercase tracking-wider">
                <th className="px-3 py-2" title="Trader user account">
                  User
                </th>
                <th className="px-3 py-2" title="Maximum single order quantity permitted">
                  Max Order Qty
                </th>
                <th className="px-3 py-2" title="Maximum total notional traded per day">
                  Max Daily Notional
                </th>
                <th className="px-3 py-2" title="Execution strategies this user may use">
                  Allowed Strategies
                </th>
                {isAdmin && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {traderUsers.map((user, idx) => (
                <UserLimitsRow key={user.id} user={user} isAdmin={isAdmin} idx={idx} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Journal (last 50 entries) */}
      <div>
        <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
          Recent Audit Journal (last 50)
        </div>
        <div className="border border-panel rounded overflow-hidden">
          <table data-testid="audit-table" className="w-full text-left text-[10px]">
            <thead>
              <tr className="bg-surface text-muted uppercase tracking-wider">
                <th className="px-3 py-1.5" title="Time the audit event was recorded">
                  Time
                </th>
                <th className="px-3 py-1.5" title="Type of audit event">
                  Event
                </th>
                <th className="px-3 py-1.5" title="Execution algorithm used">
                  Algo
                </th>
                <th className="px-3 py-1.5" title="Instrument symbol">
                  Instrument
                </th>
                <th className="px-3 py-1.5" title="Order direction: BUY or SELL">
                  Side
                </th>
                <th className="px-3 py-1.5" title="Order quantity">
                  Qty
                </th>
                <th className="px-3 py-1.5" title="Limit price submitted">
                  Limit Px
                </th>
                <th className="px-3 py-1.5" title="Actual average fill price">
                  Fill Px
                </th>
                <th className="px-3 py-1.5" title="Quantity filled so far">
                  Filled
                </th>
              </tr>
            </thead>
            <tbody>
              {journal.value.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-subtle">
                    No journal entries yet
                  </td>
                </tr>
              ) : (
                journal.value.map((entry, idx) => (
                  <tr
                    key={entry.id}
                    className={`border-t border-panel ${
                      idx % 2 === 0 ? "bg-page" : "bg-surface/40"
                    }`}
                  >
                    <td className="px-3 py-1.5 text-muted tabular-nums whitespace-nowrap">
                      {formatUtcTime(entry.ts)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                          entry.event_type === "orders.filled"
                            ? "bg-emerald-900/50 text-emerald-400"
                            : entry.event_type === "orders.expired"
                              ? "bg-red-900/50 text-red-400"
                              : entry.event_type === "orders.submitted"
                                ? "bg-blue-900/50 text-blue-400"
                                : "bg-panel text-label"
                        }`}
                      >
                        {entry.event_type.replace("orders.", "")}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-label">{entry.algo ?? "—"}</td>
                    <td className="px-3 py-1.5 text-secondary font-mono">
                      {entry.instrument ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-1.5 font-medium ${
                        entry.side === "BUY"
                          ? "text-emerald-400"
                          : entry.side === "SELL"
                            ? "text-red-400"
                            : "text-muted"
                      }`}
                    >
                      {entry.side ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-default tabular-nums">
                      {entry.quantity?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-default tabular-nums">
                      {entry.limit_price != null ? entry.limit_price.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-default tabular-nums">
                      {entry.fill_price != null ? entry.fill_price.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-default tabular-nums">
                      {entry.filled_qty?.toLocaleString() ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
