import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import type { OrderSide } from "@veta/frontend/types.ts";

function fmt2(n: number) {
  return n.toFixed(2);
}

export function OrderPreview({
  symbol,
  qty,
  limitPx,
  side,
}: {
  symbol: string;
  qty: number;
  limitPx: number;
  side: OrderSide;
}) {
  const orderBook = useAppSelector((s) => s.market.orderBook);
  if (qty <= 0 || limitPx <= 0) return null;

  const notional = qty * limitPx;
  const book = orderBook[symbol];
  const mid = book?.mid;
  const arrivalSlippageBps =
    mid && mid > 0 ? ((limitPx - mid) / mid) * 10_000 * (side === "BUY" ? 1 : -1) : null;

  return (
    <div className="rounded bg-panel/40 border border-divider/40 px-2.5 py-1.5 text-[10px] flex items-center justify-between gap-3">
      <div className="flex gap-3">
        <span className="text-muted">Notional</span>
        <span className="tabular-nums text-secondary font-semibold">
          $
          {notional >= 1_000_000
            ? `${(notional / 1_000_000).toFixed(2)}M`
            : notional >= 1_000
              ? `${(notional / 1_000).toFixed(1)}K`
              : fmt2(notional)}
        </span>
      </div>
      {arrivalSlippageBps !== null && (
        <div className="flex gap-1.5 items-center">
          <span className="text-muted">vs Mid</span>
          <span
            className={`tabular-nums font-semibold ${
              arrivalSlippageBps > 5
                ? "text-red-400"
                : arrivalSlippageBps < -5
                  ? "text-emerald-400"
                  : "text-label"
            }`}
          >
            {arrivalSlippageBps > 0 ? "+" : ""}
            {arrivalSlippageBps.toFixed(1)}bp
          </span>
        </div>
      )}
    </div>
  );
}
