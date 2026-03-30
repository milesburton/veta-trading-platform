import type { AssetDef } from "./sp500Assets.ts";
import { BOND_UNIVERSE, type BondDef } from "./bondUniverse.ts";

function bondPriceFromYield(bond: BondDef, yld: number): number {
  const c = (bond.couponRate * bond.faceValue) / bond.periodsPerYear;
  const r = yld / bond.periodsPerYear;
  const n = bond.totalPeriods;

  if (r <= 0) return bond.faceValue + c * n;

  const pv_coupons = c * (1 - Math.pow(1 + r, -n)) / r;
  const pv_face = bond.faceValue * Math.pow(1 + r, -n);
  return parseFloat((pv_coupons + pv_face).toFixed(4));
}

function yieldVolatility(bond: BondDef): number {
  const years = bond.totalPeriods / bond.periodsPerYear;
  if (bond.issuer === "UST") {
    if (years <= 1) return 0.005;
    if (years <= 3) return 0.008;
    if (years <= 7) return 0.010;
    if (years <= 15) return 0.012;
    return 0.014;
  }
  if (years <= 3) return 0.012;
  if (years <= 7) return 0.015;
  return 0.018;
}

function bondToAssetDef(bond: BondDef): AssetDef {
  return {
    symbol: bond.symbol,
    initialPrice: bondPriceFromYield(bond, bond.initialYield),
    volatility: yieldVolatility(bond),
    sector: bond.issuer === "UST" ? "UST" : (bond.sector ?? "Corp"),
    dailyVolume: bond.issuer === "UST" ? 50_000 : 5_000,
    marketCapB: 0,
    beta: 0,
    dividendYield: bond.couponRate,
    peRatio: 0,
    float: 1.0,
    exchange: "XNYS" as const,
    currency: "USD" as const,
    assetClass: "bond",
    isin: bond.isin,
    lotSize: 1,
  };
}

export const BOND_ASSETS: AssetDef[] = BOND_UNIVERSE.map(bondToAssetDef);

export const BOND_ASSET_MAP = new Map(BOND_ASSETS.map((a) => [a.symbol, a]));

export { bondPriceFromYield };
