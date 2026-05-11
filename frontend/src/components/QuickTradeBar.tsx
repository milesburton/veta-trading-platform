import { useSignal } from "@preact/signals-react";
import type React from "react";
import { useMemo } from "react";
import {
  parseQuickTrade,
  type QuickTradeIntent,
  QuickTradeIntentSchema,
} from "../domain/quickTrade/parse.ts";
import { useAppSelector } from "../store/hooks.ts";
import { useParseTicketMutation } from "../store/parseTicketApi.ts";
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
  const [parseTicket, parseTicketState] = useParseTicketMutation();

  const input = useSignal("");
  const flash = useSignal<{ kind: "ok" | "err"; msg: string } | null>(null);

  const knownSymbols = useMemo(() => new Set(assets.map((a) => a.symbol)), [assets]);
  const symbolList = useMemo(() => assets.map((a) => a.symbol), [assets]);

  if (!user || user.role !== "trader") return null;

  const regexIntent = parseQuickTrade(input.value, { knownSymbols });
  const canAskAi = !regexIntent && input.value.trim().length >= 8 && !parseTicketState.isLoading;

  function send() {
    if (!regexIntent) {
      flash.value = { kind: "err", msg: "Couldn't parse — try: buy 500 aapl @ 200 twap 30m" };
      return;
    }
    openOrderTicketWindow(ticketSize, regexIntent);
    flash.value = { kind: "ok", msg: `Opened ticket → ${formatIntent(regexIntent)}` };
    input.value = "";
  }

  async function askAi() {
    const text = input.value.trim();
    if (text.length === 0) return;
    flash.value = { kind: "ok", msg: "Asking AI…" };
    try {
      const result = await parseTicket({ input: text, symbols: symbolList }).unwrap();
      if ("intent" in result) {
        const parsed = QuickTradeIntentSchema.safeParse(result.intent);
        if (!parsed.success) {
          flash.value = { kind: "err", msg: "AI response failed validation" };
          return;
        }
        openOrderTicketWindow(ticketSize, parsed.data);
        flash.value = { kind: "ok", msg: `Opened ticket → ${formatIntent(parsed.data)}` };
        input.value = "";
        return;
      }
      flash.value = { kind: "err", msg: `AI: ${result.error}` };
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 503) {
        flash.value = { kind: "err", msg: "AI is offline — try the shorthand grammar instead" };
      } else if (status === 422) {
        flash.value = { kind: "err", msg: "AI couldn't parse that — rephrase or use shorthand" };
      } else {
        flash.value = { kind: "err", msg: "AI request failed" };
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (regexIntent) send();
      else if (canAskAi) askAi();
    } else if (e.key === "Escape") {
      input.value = "";
      flash.value = null;
    }
  }

  const previewClass = regexIntent
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
        placeholder="buy 500 aapl @ 200 twap 30m — or describe in natural language"
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
        {regexIntent
          ? `→ ${formatIntent(regexIntent)}`
          : input.value.length === 0
            ? ""
            : "no match"}
      </span>
      <button
        type="button"
        data-testid="quick-trade-send"
        onClick={send}
        disabled={!regexIntent}
        className="shrink-0 px-3 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold uppercase tracking-wide transition-colors"
      >
        Send → Ticket
      </button>
      <button
        type="button"
        data-testid="quick-trade-ask-ai"
        onClick={askAi}
        disabled={!canAskAi}
        title="Use the LLM to parse free-form instructions"
        className="shrink-0 px-2 py-0.5 rounded border border-emerald-700 hover:bg-emerald-900/40 disabled:opacity-30 disabled:cursor-not-allowed text-emerald-300 text-[11px] font-semibold uppercase tracking-wide transition-colors"
      >
        {parseTicketState.isLoading ? "Asking…" : "Ask AI"}
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
