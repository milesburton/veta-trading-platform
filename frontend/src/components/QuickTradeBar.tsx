import { useSignal } from "@preact/signals-react";
import { useMemo } from "react";
import { parseQuickTrade, type QuickTradeIntent } from "../domain/quickTrade/parse.ts";
import { useAppSelector } from "../store/hooks.ts";
import { selectOrderTicketWindowSize } from "../store/uiSlice.ts";
import { openOrderTicketWindow } from "../utils/orderTicketWindow.ts";

function formatIntent(intent: QuickTradeIntent): string {
  const parts: string[] = [intent.side, intent.symbol];
  if (intent.quantity !== undefined) parts.unshift(String(intent.quantity));
  if (intent.limitPrice !== undefined) parts.push(`@ ${intent.limitPrice}`);
  if (intent.strategy && intent.strategy !== "LIMIT") parts.push(intent.strategy);
  if (intent.twapDurationMinutes !== undefined) parts.push(`${intent.twapDurationMinutes}m`);
  if (intent.povRatePercent !== undefined) parts.push(`${intent.povRatePercent}%`);
  if (intent.tif && intent.tif !== "DAY") parts.push(intent.tif);
  return parts.join(" ");
}

export function QuickTradeBar() {
  const user = useAppSelector((s) => s.auth.user);
  const assets = useAppSelector((s) => s.market.assets);
  const ticketSize = useAppSelector(selectOrderTicketWindowSize);

  const input = useSignal("");
  const flash = useSignal<{ kind: "ok" | "err"; msg: string } | null>(null);

  const knownSymbols = useMemo(() => new Set(assets.map((a) => a.symbol)), [assets]);

  if (!user || user.role !== "trader") return null;

  const intent = parseQuickTrade(input.value, { knownSymbols });

  function send() {
    if (!intent) {
      flash.value = { kind: "err", msg: "Couldn't parse — try: buy 500 aapl @ 200 twap 30m" };
      return;
    }
    openOrderTicketWindow(ticketSize, intent);
    flash.value = { kind: "ok", msg: `Opened ticket → ${formatIntent(intent)}` };
    input.value = "";
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      input.value = "";
      flash.value = null;
    }
  }

  const previewClass = intent
    ? "text-emerald-400"
    : input.value.length > 0
      ? "text-amber-400"
      : "text-muted";

  return (
    <div
      data-testid="quick-trade-bar"
      className="flex items-center gap-3 px-4 h-9 bg-page border-b border-panel text-xs"
    >
      <span className="text-[10px] font-semibold tracking-widest uppercase text-emerald-400 shrink-0">
        Quick trade
      </span>
      <input
        data-testid="quick-trade-input"
        value={input.value}
        onChange={(e) => {
          input.value = e.target.value;
          if (flash.value) flash.value = null;
        }}
        onKeyDown={onKeyDown}
        placeholder="buy 500 aapl @ 200 twap 30m"
        aria-label="Quick trade — natural-language order entry"
        className="flex-1 bg-surface border border-panel rounded px-3 py-1 text-sm font-mono text-primary placeholder:text-subtle focus:outline-none focus:border-emerald-600"
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
      />
      <span
        data-testid="quick-trade-preview"
        className={`shrink-0 text-[11px] font-mono ${previewClass}`}
      >
        {intent ? `→ ${formatIntent(intent)}` : input.value.length === 0 ? "" : "no match"}
      </span>
      <button
        type="button"
        data-testid="quick-trade-send"
        onClick={send}
        disabled={!intent}
        className="shrink-0 px-3 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold uppercase tracking-wide transition-colors"
      >
        Send → Ticket
      </button>
      {flash.value && (
        <span
          data-testid="quick-trade-flash"
          className={`shrink-0 text-[10px] ${
            flash.value.kind === "ok" ? "text-emerald-400" : "text-amber-400"
          }`}
        >
          {flash.value.msg}
        </span>
      )}
    </div>
  );
}
