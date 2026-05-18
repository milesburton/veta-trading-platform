import type { BondDef } from "@veta/frontend/data/bondUniverse.ts";
import type {
  AlgoParams,
  AssetDef,
  BondSpec,
  InstrumentType,
  OrderSide,
  Trade,
} from "@veta/frontend/types.ts";

export interface BuildTradeInputs {
  selectedAsset: AssetDef;
  activeSide: OrderSide;
  qty: number;
  isOptions: boolean;
  isBond: boolean;
  selectedBondDef?: BondDef;
  optionType: "call" | "put";
  optionStrikeNum: number;
  optionExpirySecs: number;
  optionPremium?: number;
  bondPrice?: number;
  bondYieldValue: string;
  lx: number;
  expiresAtSecs: number;
  instrumentType: InstrumentType;
  algoParams: AlgoParams;
}

const FIXED_BOND_LIMIT_PARAMS: AlgoParams = { strategy: "LIMIT" };

function buildBondSpec(def: BondDef, yieldValue: string): BondSpec {
  const yldDecimal = Number(yieldValue) > 0 ? Number(yieldValue) / 100 : def.initialYield;
  return {
    isin: def.isin,
    symbol: def.symbol,
    description: def.description,
    couponRate: def.couponRate,
    maturityDate: def.maturityDate,
    totalPeriods: def.totalPeriods,
    periodsPerYear: def.periodsPerYear,
    faceValue: def.faceValue,
    yieldAtOrder: yldDecimal,
    creditRating: def.creditRating,
  };
}

function deriveExtendedInstrument(it: InstrumentType): "fx" | "commodity" | undefined {
  if (it === "fx") return "fx";
  if (it === "commodity") return "commodity";
  return undefined;
}

export function buildTrade(inputs: BuildTradeInputs): Trade {
  if (inputs.isOptions) {
    return {
      asset: inputs.selectedAsset.symbol,
      side: inputs.activeSide,
      quantity: inputs.qty,
      limitPrice: inputs.lx,
      expiresAt: 300,
      algoParams: FIXED_BOND_LIMIT_PARAMS,
      instrumentType: "option",
      optionSpec: {
        optionType: inputs.optionType,
        strike: inputs.optionStrikeNum,
        expirySecs: inputs.optionExpirySecs,
        premium: inputs.optionPremium,
      },
    };
  }

  if (inputs.isBond && inputs.selectedBondDef) {
    return {
      asset: inputs.selectedBondDef.symbol,
      side: inputs.activeSide,
      quantity: inputs.qty,
      limitPrice: inputs.bondPrice ?? 0,
      expiresAt: 300,
      algoParams: FIXED_BOND_LIMIT_PARAMS,
      instrumentType: "bond",
      bondSpec: buildBondSpec(inputs.selectedBondDef, inputs.bondYieldValue),
    };
  }

  const extendedType = deriveExtendedInstrument(inputs.instrumentType);
  return {
    asset: inputs.selectedAsset.symbol,
    side: inputs.activeSide,
    quantity: inputs.qty,
    limitPrice: inputs.lx,
    expiresAt: inputs.expiresAtSecs,
    algoParams: inputs.algoParams,
    ...(extendedType ? { instrumentType: extendedType } : {}),
  };
}
