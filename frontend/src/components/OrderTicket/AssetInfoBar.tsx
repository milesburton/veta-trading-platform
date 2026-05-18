import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import { formatPrice } from "@veta/frontend/utils/formatPrice.ts";

export function AssetInfoBar({ symbol }: { symbol: string }) {
  const assets = useAppSelector((s) => s.market.assets);
  const orderBook = useAppSelector((s) => s.market.orderBook);
  const asset = assets.find((a) => a.symbol === symbol);
  if (!asset) return null;

  const book = orderBook[symbol];
  const bid = book?.bids[0]?.price;
  const ask = book?.asks[0]?.price;
  const spreadBps = bid && ask ? (((ask - bid) / ((bid + ask) / 2)) * 10_000).toFixed(1) : null;

  return (
    <div
      className="rounded bg-panel/60 border border-divider/50 px-2.5 py-2 text-[10px] grid grid-cols-2 gap-x-4 gap-y-1"
      data-testid="asset-info-bar"
    >
      <div className="flex justify-between">
        <span className="text-muted">Bid</span>
        <span className="tabular-nums text-sky-400">{bid ? formatPrice(symbol, bid) : "—"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Ask</span>
        <span className="tabular-nums text-red-400">{ask ? formatPrice(symbol, ask) : "—"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Spread</span>
        <span className="tabular-nums text-label">{spreadBps ? `${spreadBps}bp` : "—"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Beta</span>
        <span className="tabular-nums text-label">
          {asset.beta !== undefined ? asset.beta.toFixed(2) : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Mkt Cap</span>
        <span className="tabular-nums text-label">
          {asset.marketCapB !== undefined
            ? asset.marketCapB >= 1000
              ? `$${(asset.marketCapB / 1000).toFixed(1)}T`
              : `$${asset.marketCapB.toFixed(0)}B`
            : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Div Yld</span>
        <span className="tabular-nums text-label">
          {asset.dividendYield !== undefined && asset.dividendYield > 0
            ? `${(asset.dividendYield * 100).toFixed(2)}%`
            : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">P/E</span>
        <span className="tabular-nums text-label">
          {asset.peRatio !== undefined && asset.peRatio > 0 ? asset.peRatio.toFixed(1) : "—"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Exchange</span>
        <span className="tabular-nums text-label">{asset.exchange ?? "—"}</span>
      </div>
    </div>
  );
}
