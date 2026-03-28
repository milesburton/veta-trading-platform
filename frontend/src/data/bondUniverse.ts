/**
 * Frontend bond universe — mirrors backend/src/market-sim/bondUniverse.ts.
 *
 * 10 US Treasuries + 5 investment-grade corporate bonds.
 * Maintained separately because backend Deno modules cannot be imported into Vite.
 */

export interface BondDef {
  isin: string;
  symbol: string;
  description: string;
  couponRate: number; // annual (decimal)
  maturityDate: string; // ISO date string
  periodsPerYear: number;
  totalPeriods: number;
  creditRating: string;
  issuer: "UST" | "Corp";
  sector?: string;
  initialYield: number;
  faceValue: number;
}

export const BOND_UNIVERSE: BondDef[] = [
  {
    isin: "US912796ZR07",
    symbol: "US3M",
    description: "3-Month US Treasury Bill",
    couponRate: 0.0,
    maturityDate: "2026-06-01",
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
    couponRate: 0.0,
    maturityDate: "2026-09-01",
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
    couponRate: 0.05,
    maturityDate: "2027-03-01",
    periodsPerYear: 2,
    totalPeriods: 2,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.051,
    faceValue: 1000,
  },
  {
    isin: "US91282CKL26",
    symbol: "US2Y",
    description: "2-Year US Treasury Note",
    couponRate: 0.0475,
    maturityDate: "2028-03-01",
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
    couponRate: 0.045,
    maturityDate: "2029-03-01",
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
    maturityDate: "2031-03-01",
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
    maturityDate: "2033-03-01",
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
    maturityDate: "2036-03-01",
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
    couponRate: 0.0475,
    maturityDate: "2046-03-01",
    periodsPerYear: 2,
    totalPeriods: 40,
    creditRating: "AAA",
    issuer: "UST",
    initialYield: 0.048,
    faceValue: 1000,
  },
  {
    isin: "US912810TM04",
    symbol: "US30Y",
    description: "30-Year US Treasury Bond",
    couponRate: 0.04625,
    maturityDate: "2056-03-01",
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
    couponRate: 0.051,
    maturityDate: "2031-03-01",
    periodsPerYear: 2,
    totalPeriods: 10,
    creditRating: "AA+",
    issuer: "Corp",
    sector: "Technology",
    initialYield: 0.052,
    faceValue: 1000,
  },
  {
    isin: "US46625HRL59",
    symbol: "JPM10Y",
    description: "JPMorgan Chase & Co. 10-Year Senior Note",
    couponRate: 0.054,
    maturityDate: "2036-03-01",
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
    couponRate: 0.052,
    maturityDate: "2033-03-01",
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
    couponRate: 0.049,
    maturityDate: "2029-03-01",
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
    maturityDate: "2031-03-01",
    periodsPerYear: 2,
    totalPeriods: 10,
    creditRating: "AAA",
    issuer: "Corp",
    sector: "Technology",
    initialYield: 0.0512,
    faceValue: 1000,
  },
];

export function getBond(symbol: string): BondDef | undefined {
  return BOND_UNIVERSE.find((b) => b.symbol === symbol);
}

export function getBonds(filter?: { issuer?: "UST" | "Corp" }): BondDef[] {
  if (!filter?.issuer) return BOND_UNIVERSE;
  return BOND_UNIVERSE.filter((b) => b.issuer === filter.issuer);
}
