function fmt2(n: number) {
  return n.toFixed(2);
}

export function OptionPreview({ qty, premium }: { qty: number; premium: number }) {
  if (qty <= 0 || premium <= 0) return null;
  const notional = qty * 100 * premium;
  return (
    <div className="rounded bg-panel/40 border border-divider/40 px-2.5 py-1.5 text-[10px] flex items-center justify-between gap-3">
      <span className="text-muted">
        {qty} contract{qty !== 1 ? "s" : ""}
      </span>
      <span className="tabular-nums text-secondary font-semibold">
        $
        {notional >= 1_000_000
          ? `${(notional / 1_000_000).toFixed(2)}M`
          : notional >= 1_000
            ? `${(notional / 1_000).toFixed(1)}K`
            : fmt2(notional)}
        {" notional"}
      </span>
    </div>
  );
}
