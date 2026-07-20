export interface BondDef {
  isin: string; // synthetic CUSIP-format ISIN
  symbol: string; // short display key, e.g. "US10Y"
  description: string; // human-readable label
  couponRate: number; // annual coupon rate (decimal, e.g. 0.04375)
  maturityDate: string; // ISO date (approximate, based on totalPeriods)
  periodsPerYear: number; // 2 = semi-annual
  totalPeriods: number; // total coupon periods
  creditRating: string; // "AAA", "AA+", "A+", etc.
  issuer: "UST" | "Corp";
  sector?: string; // Corp only
  initialYield: number; // seed yield for UI default
  faceValue: number; // 1000
}
