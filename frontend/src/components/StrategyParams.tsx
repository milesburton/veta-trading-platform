// JSX runtime enabled; no default React import needed

interface Props {
  activeStrategy: string;
  twapSlices: string;
  setTwapSlices: (v: string) => void;
  twapCap: string;
  setTwapCap: (v: string) => void;
  povRate: string;
  setPovRate: (v: string) => void;
  povMin: string;
  setPovMin: (v: string) => void;
  povMax: string;
  setPovMax: (v: string) => void;
  vwapDev: string;
  setVwapDev: (v: string) => void;
  vwapStart: string;
  setVwapStart: (v: string) => void;
  vwapEnd: string;
  setVwapEnd: (v: string) => void;
  icebergVisible: string;
  setIcebergVisible: (v: string) => void;
  sniperAggression: string;
  setSniperAggression: (v: string) => void;
  sniperMaxVenues: string;
  setSniperMaxVenues: (v: string) => void;
  apUrgency: string;
  setApUrgency: (v: string) => void;
  apMaxSlippageBps: string;
  setApMaxSlippageBps: (v: string) => void;
}

export function StrategyParams({
  activeStrategy,
  twapSlices,
  setTwapSlices,
  twapCap,
  setTwapCap,
  povRate,
  setPovRate,
  povMin,
  setPovMin,
  povMax,
  setPovMax,
  vwapDev,
  setVwapDev,
  vwapStart,
  setVwapStart,
  vwapEnd,
  setVwapEnd,
  icebergVisible,
  setIcebergVisible,
  sniperAggression,
  setSniperAggression,
  sniperMaxVenues,
  setSniperMaxVenues,
  apUrgency,
  setApUrgency,
  apMaxSlippageBps,
  setApMaxSlippageBps,
}: Props) {
  if (activeStrategy === "TWAP") {
    return (
      <div className="border border-gray-800 rounded p-2 space-y-2">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">TWAP Params</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="twapSlices" className="block text-xs text-gray-500 mb-1">
              Slices
            </label>
            <input
              id="twapSlices"
              type="number"
              min="1"
              value={twapSlices}
              onChange={(e) => setTwapSlices(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="twapCap" className="block text-xs text-gray-500 mb-1">
              Part. Cap %
            </label>
            <input
              id="twapCap"
              type="number"
              min="1"
              max="100"
              value={twapCap}
              onChange={(e) => setTwapCap(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  if (activeStrategy === "POV") {
    return (
      <div className="border border-gray-800 rounded p-2 space-y-2">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">POV Params</div>
        <div>
          <label htmlFor="povRate" className="block text-xs text-gray-500 mb-1">
            Participation Rate %
          </label>
          <input
            id="povRate"
            type="number"
            min="1"
            max="100"
            value={povRate}
            onChange={(e) => setPovRate(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="povMin" className="block text-xs text-gray-500 mb-1">
              Min Slice
            </label>
            <input
              id="povMin"
              type="number"
              min="0"
              value={povMin}
              onChange={(e) => setPovMin(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="povMax" className="block text-xs text-gray-500 mb-1">
              Max Slice
            </label>
            <input
              id="povMax"
              type="number"
              min="1"
              value={povMax}
              onChange={(e) => setPovMax(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  if (activeStrategy === "VWAP") {
    return (
      <div className="border border-gray-800 rounded p-2 space-y-2">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">VWAP Params</div>
        <div>
          <label htmlFor="vwapDev" className="block text-xs text-gray-500 mb-1">
            Max Deviation %
          </label>
          <input
            id="vwapDev"
            type="number"
            min="0.01"
            step="0.01"
            value={vwapDev}
            onChange={(e) => setVwapDev(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="vwapStart" className="block text-xs text-gray-500 mb-1">
              Start Offset (s)
            </label>
            <input
              id="vwapStart"
              type="number"
              min="0"
              value={vwapStart}
              onChange={(e) => setVwapStart(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="vwapEnd" className="block text-xs text-gray-500 mb-1">
              End Offset (s)
            </label>
            <input
              id="vwapEnd"
              type="number"
              min="1"
              value={vwapEnd}
              onChange={(e) => setVwapEnd(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  if (activeStrategy === "ICEBERG") {
    return (
      <div className="border border-gray-800 rounded p-2 space-y-2">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">ICEBERG Params</div>
        <div>
          <label htmlFor="icebergVisible" className="block text-xs text-gray-500 mb-1">
            Visible Qty <span className="text-gray-600">(shares per slice)</span>
          </label>
          <input
            id="icebergVisible"
            type="number"
            min="1"
            value={icebergVisible}
            onChange={(e) => setIcebergVisible(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>
      </div>
    );
  }

  if (activeStrategy === "SNIPER") {
    return (
      <div className="border border-gray-800 rounded p-2 space-y-2">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">SNIPER Params</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="sniperAggression" className="block text-xs text-gray-500 mb-1">
              Aggression %
            </label>
            <input
              id="sniperAggression"
              type="number"
              min="1"
              max="100"
              value={sniperAggression}
              onChange={(e) => setSniperAggression(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="sniperMaxVenues" className="block text-xs text-gray-500 mb-1">
              Max Venues
            </label>
            <input
              id="sniperMaxVenues"
              type="number"
              min="1"
              max="3"
              value={sniperMaxVenues}
              onChange={(e) => setSniperMaxVenues(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  if (activeStrategy === "ARRIVAL_PRICE") {
    return (
      <div className="border border-gray-800 rounded p-2 space-y-2">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">
          ARRIVAL PRICE Params
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="apUrgency" className="block text-xs text-gray-500 mb-1">
              Urgency
            </label>
            <input
              id="apUrgency"
              type="number"
              min="1"
              max="100"
              value={apUrgency}
              onChange={(e) => setApUrgency(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="apMaxSlippageBps" className="block text-xs text-gray-500 mb-1">
              Max Slippage Bps
            </label>
            <input
              id="apMaxSlippageBps"
              type="number"
              min="1"
              value={apMaxSlippageBps}
              onChange={(e) => setApMaxSlippageBps(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default StrategyParams;
