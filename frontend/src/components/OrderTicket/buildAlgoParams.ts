import type {
  AlgoParams,
  ArrivalPriceParams,
  IcebergParams,
  IsParams,
  LimitParams,
  MomentumParams,
  PovParams,
  SniperParams,
  TwapParams,
  VwapParams,
} from "@veta/frontend/types.ts";

export interface AlgoParamInputs {
  twapSlices: string;
  twapCap: string;
  povRate: string;
  povMin: string;
  povMax: string;
  vwapDev: string;
  vwapStart: string;
  vwapEnd: string;
  icebergVisible: string;
  sniperAggression: string;
  sniperMaxVenues: string;
  apUrgency: string;
  apMaxSlippageBps: string;
  isUrgency: string;
  isMaxSlippageBps: string;
  isMinSlices: string;
  isMaxSlices: string;
  momentumThreshold: string;
  momentumMaxTranches: string;
  momentumShortEma: string;
  momentumLongEma: string;
  momentumCooldown: string;
}

type Builder = (inputs: AlgoParamInputs) => AlgoParams;

const BUILDERS: Record<string, Builder> = {
  TWAP: (i): TwapParams => ({
    strategy: "TWAP",
    numSlices: Number(i.twapSlices),
    participationCap: Number(i.twapCap),
  }),
  POV: (i): PovParams => ({
    strategy: "POV",
    participationRate: Number(i.povRate),
    minSliceSize: Number(i.povMin),
    maxSliceSize: Number(i.povMax),
  }),
  VWAP: (i): VwapParams => ({
    strategy: "VWAP",
    maxDeviation: Number(i.vwapDev) / 100,
    startOffsetSecs: Number(i.vwapStart),
    endOffsetSecs: Number(i.vwapEnd),
  }),
  ICEBERG: (i): IcebergParams => ({
    strategy: "ICEBERG",
    visibleQty: Number(i.icebergVisible),
  }),
  SNIPER: (i): SniperParams => ({
    strategy: "SNIPER",
    aggressionPct: Number(i.sniperAggression),
    maxVenues: Number(i.sniperMaxVenues),
  }),
  ARRIVAL_PRICE: (i): ArrivalPriceParams => ({
    strategy: "ARRIVAL_PRICE",
    urgency: Number(i.apUrgency),
    maxSlippageBps: Number(i.apMaxSlippageBps),
  }),
  IS: (i): IsParams => ({
    strategy: "IS",
    urgency: Number(i.isUrgency),
    maxSlippageBps: Number(i.isMaxSlippageBps),
    minSlices: Number(i.isMinSlices),
    maxSlices: Number(i.isMaxSlices),
  }),
  MOMENTUM: (i): MomentumParams => ({
    strategy: "MOMENTUM",
    entryThresholdBps: Number(i.momentumThreshold),
    maxTranches: Number(i.momentumMaxTranches),
    shortEmaPeriod: Number(i.momentumShortEma),
    longEmaPeriod: Number(i.momentumLongEma),
    cooldownTicks: Number(i.momentumCooldown),
  }),
};

const LIMIT_FALLBACK: LimitParams = { strategy: "LIMIT" };

export function buildAlgoParams(strategy: string, inputs: AlgoParamInputs): AlgoParams {
  return BUILDERS[strategy]?.(inputs) ?? LIMIT_FALLBACK;
}
