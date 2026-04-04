/**
 * Synthetic fixed-income asset universe.
 *
 * 10 US Treasuries (on-the-run curve) + 5 investment-grade corporate bonds.
 * Coupon rates and initial yields approximate a realistic post-2024 environment
 * (Fed funds ~5.25%, IG corp spread ~80–120bp over Treasuries).
 *
 * totalPeriods = maturityYears × periodsPerYear (semi-annual = 2)
 */

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

// Helper to compute an approximate maturity date from number of semi-annual periods
function maturityFromPeriods(totalPeriods: number): string {
  const yearsFromNow = totalPeriods / 2;
  const d = new Date();
  d.setFullYear(d.getFullYear() + Math.floor(yearsFromNow));
  d.setMonth(d.getMonth() + Math.round((yearsFromNow % 1) * 12));
  return d.toISOString().slice(0, 10);
}

export const BOND_UNIVERSE: BondDef[] = [
  {
    isin: "US912796ZR07",
    symbol: "US3M",
    description: "3-Month US Treasury Bill",
    couponRate: 0.000,
    maturityDate: maturityFromPeriods(1),
    periodsPerYear: 2,
    totalPeriods: 1,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.0532,
    faceValue: 1000,
  },
  {
    isin: "US912796ZS80",
    symbol: "US6M",
    description: "6-Month US Treasury Bill",
    couponRate: 0.000,
    maturityDate: maturityFromPeriods(1),
    periodsPerYear: 2,
    totalPeriods: 1,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.0528,
    faceValue: 1000,
  },
  {
    isin: "US912828ZT01",
    symbol: "US1Y",
    description: "1-Year US Treasury Note",
    couponRate: 0.0500,
    maturityDate: maturityFromPeriods(2),
    periodsPerYear: 2,
    totalPeriods: 2,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.0510,
    faceValue: 1000,
  },
  {
    isin: "US91282CKL26",
    symbol: "US2Y",
    description: "2-Year US Treasury Note",
    couponRate: 0.0475,
    maturityDate: maturityFromPeriods(4),
    periodsPerYear: 2,
    totalPeriods: 4,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.0488,
    faceValue: 1000,
  },
  {
    isin: "US91282CKM09",
    symbol: "US3Y",
    description: "3-Year US Treasury Note",
    couponRate: 0.0450,
    maturityDate: maturityFromPeriods(6),
    periodsPerYear: 2,
    totalPeriods: 6,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.0462,
    faceValue: 1000,
  },
  {
    isin: "US91282CKN81",
    symbol: "US5Y",
    description: "5-Year US Treasury Note",
    couponRate: 0.0425,
    maturityDate: maturityFromPeriods(10),
    periodsPerYear: 2,
    totalPeriods: 10,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.0435,
    faceValue: 1000,
  },
  {
    isin: "US91282CKP38",
    symbol: "US7Y",
    description: "7-Year US Treasury Note",
    couponRate: 0.0425,
    maturityDate: maturityFromPeriods(14),
    periodsPerYear: 2,
    totalPeriods: 14,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.0432,
    faceValue: 1000,
  },
  {
    isin: "US91282CKQ11",
    symbol: "US10Y",
    description: "10-Year US Treasury Note",
    couponRate: 0.04375,
    maturityDate: maturityFromPeriods(20),
    periodsPerYear: 2,
    totalPeriods: 20,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.0445,
    faceValue: 1000,
  },
  {
    isin: "US912810TL21",
    symbol: "US20Y",
    description: "20-Year US Treasury Bond",
    couponRate: 0.04750,
    maturityDate: maturityFromPeriods(40),
    periodsPerYear: 2,
    totalPeriods: 40,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.0480,
    faceValue: 1000,
  },
  {
    isin: "US912810TM04",
    symbol: "US30Y",
    description: "30-Year US Treasury Bond",
    couponRate: 0.04625,
    maturityDate: maturityFromPeriods(60),
    periodsPerYear: 2,
    totalPeriods: 60,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.0468,
    faceValue: 1000,
  },

  {
    isin: "US037833EQ73",
    symbol: "AAPL5Y",
    description: "Apple Inc. 5-Year Senior Note",
    couponRate: 0.0510,
    maturityDate: maturityFromPeriods(10),
    periodsPerYear: 2,
    totalPeriods: 10,
    creditRating: "AA+",
    issuer: "Corp",
    sector: "Technology",
    initialYield: 0.0520,
    faceValue: 1000,
  },
  {
    isin: "US46625HRL59",
    symbol: "JPM10Y",
    description: "JPMorgan Chase & Co. 10-Year Senior Note",
    couponRate: 0.0540,
    maturityDate: maturityFromPeriods(20),
    periodsPerYear: 2,
    totalPeriods: 20,
    creditRating: "A+",
    issuer: "Corp",
    sector: "Financials",
    initialYield: 0.0555,
    faceValue: 1000,
  },
  {
    isin: "US30231GAV85",
    symbol: "XOM7Y",
    description: "Exxon Mobil Corporation 7-Year Senior Note",
    couponRate: 0.0520,
    maturityDate: maturityFromPeriods(14),
    periodsPerYear: 2,
    totalPeriods: 14,
    creditRating: "AA",
    issuer: "Corp",
    sector: "Energy",
    initialYield: 0.0528,
    faceValue: 1000,
  },
  {
    isin: "US478160CG87",
    symbol: "JNJ3Y",
    description: "Johnson & Johnson 3-Year Senior Note",
    couponRate: 0.0490,
    maturityDate: maturityFromPeriods(6),
    periodsPerYear: 2,
    totalPeriods: 6,
    creditRating: "AAA",
    issuer: "Corp",
    sector: "Healthcare",
    initialYield: 0.0498,
    faceValue: 1000,
  },
  {
    isin: "US594918BN46",
    symbol: "MSFT5Y",
    description: "Microsoft Corporation 5-Year Senior Note",
    couponRate: 0.0505,
    maturityDate: maturityFromPeriods(10),
    periodsPerYear: 2,
    totalPeriods: 10,
    creditRating: "AAA",
    issuer: "Corp",
    sector: "Technology",
    initialYield: 0.0512,
    faceValue: 1000,
  },
];

/** Look up a bond by symbol. */
export function getBond(symbol: string): BondDef | undefined {
  return BOND_UNIVERSE.find((b) => b.symbol === symbol);
}

/** Return all bonds or filter by issuer type. */
export function getBonds(filter?: { issuer?: "UST" | "Corp" }): BondDef[] {
  if (!filter?.issuer) return BOND_UNIVERSE;
  return BOND_UNIVERSE.filter((b) => b.issuer === filter.issuer);
}
