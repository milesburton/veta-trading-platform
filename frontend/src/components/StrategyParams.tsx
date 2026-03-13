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
  isUrgency: string;
  setIsUrgency: (v: string) => void;
  isMaxSlippageBps: string;
  setIsMaxSlippageBps: (v: string) => void;
  isMinSlices: string;
  setIsMinSlices: (v: string) => void;
  isMaxSlices: string;
  setIsMaxSlices: (v: string) => void;
  momentumThreshold: string;
  setMomentumThreshold: (v: string) => void;
  momentumMaxTranches: string;
  setMomentumMaxTranches: (v: string) => void;
  momentumShortEma: string;
  setMomentumShortEma: (v: string) => void;
  momentumLongEma: string;
  setMomentumLongEma: (v: string) => void;
  momentumCooldown: string;
  setMomentumCooldown: (v: string) => void;
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
  isUrgency,
  setIsUrgency,
  isMaxSlippageBps,
  setIsMaxSlippageBps,
  isMinSlices,
  setIsMinSlices,
  isMaxSlices,
  setIsMaxSlices,
  momentumThreshold,
  setMomentumThreshold,
  momentumMaxTranches,
  setMomentumMaxTranches,
  momentumShortEma,
  setMomentumShortEma,
  momentumLongEma,
  setMomentumLongEma,
  momentumCooldown,
  setMomentumCooldown,
}: Props) {
  if (activeStrategy === "TWAP") {
    return (
      <div data-testid="strategy-params" className="border border-gray-800 rounded p-2 space-y-2">
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
              data-testid="param-slices"
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
              data-testid="param-participation-cap"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  if (activeStrategy === "POV") {
    return (
      <div data-testid="strategy-params" className="border border-gray-800 rounded p-2 space-y-2">
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
            data-testid="param-participation-rate"
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
              data-testid="param-min-slice"
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
              data-testid="param-max-slice"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  if (activeStrategy === "VWAP") {
    return (
      <div data-testid="strategy-params" className="border border-gray-800 rounded p-2 space-y-2">
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
            data-testid="param-max-deviation"
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
              data-testid="param-start-offset"
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
              data-testid="param-end-offset"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  if (activeStrategy === "ICEBERG") {
    return (
      <div data-testid="strategy-params" className="border border-gray-800 rounded p-2 space-y-2">
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
            data-testid="param-visible-qty"
            className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
          />
        </div>
      </div>
    );
  }

  if (activeStrategy === "SNIPER") {
    return (
      <div data-testid="strategy-params" className="border border-gray-800 rounded p-2 space-y-2">
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
              data-testid="param-aggression"
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
              data-testid="param-max-venues"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  if (activeStrategy === "ARRIVAL_PRICE") {
    return (
      <div data-testid="strategy-params" className="border border-gray-800 rounded p-2 space-y-2">
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
              data-testid="param-urgency"
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
              data-testid="param-max-slippage-bps"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  if (activeStrategy === "IS") {
    return (
      <div data-testid="strategy-params" className="border border-gray-800 rounded p-2 space-y-2">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">
          Implementation Shortfall Params
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="isUrgency" className="block text-xs text-gray-500 mb-1">
              Urgency
            </label>
            <input
              id="isUrgency"
              type="number"
              min="1"
              max="100"
              value={isUrgency}
              onChange={(e) => setIsUrgency(e.target.value)}
              data-testid="param-is-urgency"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="isMaxSlippageBps" className="block text-xs text-gray-500 mb-1">
              Max Slippage Bps
            </label>
            <input
              id="isMaxSlippageBps"
              type="number"
              min="1"
              value={isMaxSlippageBps}
              onChange={(e) => setIsMaxSlippageBps(e.target.value)}
              data-testid="param-is-max-slippage-bps"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="isMinSlices" className="block text-xs text-gray-500 mb-1">
              Min Slices
            </label>
            <input
              id="isMinSlices"
              type="number"
              min="1"
              value={isMinSlices}
              onChange={(e) => setIsMinSlices(e.target.value)}
              data-testid="param-is-min-slices"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="isMaxSlices" className="block text-xs text-gray-500 mb-1">
              Max Slices
            </label>
            <input
              id="isMaxSlices"
              type="number"
              min="1"
              value={isMaxSlices}
              onChange={(e) => setIsMaxSlices(e.target.value)}
              data-testid="param-is-max-slices"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
        </div>
      </div>
    );
  }

  if (activeStrategy === "MOMENTUM") {
    return (
      <div data-testid="strategy-params" className="border border-gray-800 rounded p-2 space-y-2">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider">Momentum Params</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="momentumThreshold" className="block text-xs text-gray-500 mb-1">
              Entry Threshold Bps
            </label>
            <input
              id="momentumThreshold"
              type="number"
              min="1"
              value={momentumThreshold}
              onChange={(e) => setMomentumThreshold(e.target.value)}
              data-testid="param-momentum-threshold"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="momentumMaxTranches" className="block text-xs text-gray-500 mb-1">
              Max Tranches
            </label>
            <input
              id="momentumMaxTranches"
              type="number"
              min="1"
              value={momentumMaxTranches}
              onChange={(e) => setMomentumMaxTranches(e.target.value)}
              data-testid="param-momentum-max-tranches"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="momentumShortEma" className="block text-xs text-gray-500 mb-1">
              Short EMA Period
            </label>
            <input
              id="momentumShortEma"
              type="number"
              min="1"
              value={momentumShortEma}
              onChange={(e) => setMomentumShortEma(e.target.value)}
              data-testid="param-momentum-short-ema"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="momentumLongEma" className="block text-xs text-gray-500 mb-1">
              Long EMA Period
            </label>
            <input
              id="momentumLongEma"
              type="number"
              min="1"
              value={momentumLongEma}
              onChange={(e) => setMomentumLongEma(e.target.value)}
              data-testid="param-momentum-long-ema"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="momentumCooldown" className="block text-xs text-gray-500 mb-1">
              Cooldown Ticks
            </label>
            <input
              id="momentumCooldown"
              type="number"
              min="1"
              value={momentumCooldown}
              onChange={(e) => setMomentumCooldown(e.target.value)}
              data-testid="param-momentum-cooldown"
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
