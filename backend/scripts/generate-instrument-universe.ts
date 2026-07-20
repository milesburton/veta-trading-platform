// Generates synthetic RawAsset/BondDef seeds to expand the simulated
// instrument universe from 287 hand-authored instruments to ~2200. The
// existing 287 (S&P 500 equities, FX majors, commodity futures, curated
// bonds) are untouched; this script only appends new synthetic records.
//
// Run: deno run --allow-read --allow-write backend/scripts/generate-instrument-universe.ts

// Import only the hand-curated seed arrays (not the merged SP500_ASSETS/
// FX_ASSETS/etc. exports) so re-running this script treats a prior run's
// own generated output as regenerable, not as permanently reserved symbols.
import { CURATED_EQUITY_SEEDS } from "../src/market-sim/sp500Assets.ts";
import { CURATED_FX_SEEDS } from "../src/market-sim/fxAssets.ts";
import { CURATED_COMMODITY_SEEDS } from "../src/market-sim/commodityAssets.ts";
import { CURATED_BONDS } from "../../shared/curatedBonds.ts";

const TARGET_NEW_EQUITIES = 1_700;
const TARGET_NEW_FX = 30;
const TARGET_NEW_COMMODITIES = 20;
const TARGET_NEW_BONDS = 135;

const SEED = 42;

function mulberry32(seed: number): () => number {
  let a = seed;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ─── Global symbol registry ──────────────────────────────────────────────
// Every asset class shares one symbol namespace downstream (ALL_ASSET_MAP
// silently overwrites on collision), so uniqueness must be enforced here
// across equities + FX + commodities + bonds, against both the existing
// hand-authored symbols and everything this run generates.

const usedSymbols = new Set<string>([
  ...CURATED_EQUITY_SEEDS.map((a) => a.symbol),
  ...CURATED_FX_SEEDS.map((a) => a.symbol),
  ...CURATED_COMMODITY_SEEDS.map((a) => a.symbol),
  ...CURATED_BONDS.map((b) => b.symbol),
]);

function claimSymbol(candidate: string): string | null {
  if (usedSymbols.has(candidate)) return null;
  usedSymbols.add(candidate);
  return candidate;
}

// ─── Equities ─────────────────────────────────────────────────────────────

const SECTORS = [
  "Technology",
  "Consumer Discretionary",
  "Communication Services",
  "Financials",
  "Health Care",
  "Energy",
  "Consumer Staples",
  "Industrials",
  "Utilities",
  "Materials",
  "Real Estate",
] as const;

// Proportional to the existing SP500_ASSETS sector distribution (ETF
// excluded — synthetic tickers read oddly as fund names).
const SECTOR_WEIGHTS: Record<(typeof SECTORS)[number], number> = {
  Technology: 15,
  "Consumer Discretionary": 12,
  "Communication Services": 6,
  Financials: 11,
  "Health Care": 12,
  Energy: 7,
  "Consumer Staples": 6,
  Industrials: 12,
  Utilities: 4,
  Materials: 4,
  "Real Estate": 4,
};

function weightedSector(): (typeof SECTORS)[number] {
  const total = SECTORS.reduce((s, sec) => s + SECTOR_WEIGHTS[sec], 0);
  let roll = rng() * total;
  for (const sec of SECTORS) {
    roll -= SECTOR_WEIGHTS[sec];
    if (roll <= 0) return sec;
  }
  return SECTORS[SECTORS.length - 1];
}

const NAME_PREFIXES = [
  "North",
  "South",
  "East",
  "West",
  "Central",
  "Continental",
  "Pacific",
  "Atlantic",
  "Summit",
  "Cascade",
  "Meridian",
  "Vertex",
  "Apex",
  "Horizon",
  "Sterling",
  "Granite",
  "Beacon",
  "Anchor",
  "Cedar",
  "Redwood",
  "Titan",
  "Orbit",
  "Nova",
  "Quantum",
  "Vantage",
  "Crestline",
  "Ironwood",
  "Bluepeak",
  "Silverline",
  "Ridgeline",
];

const NAME_CORES: Record<(typeof SECTORS)[number], string[]> = {
  Technology: ["Systems", "Software", "Networks", "Cloud", "Compute", "Data", "Semiconductor", "Robotics"],
  "Consumer Discretionary": ["Retail", "Apparel", "Motors", "Leisure", "Hospitality", "Brands"],
  "Communication Services": ["Media", "Broadcasting", "Telecom", "Wireless", "Streaming"],
  Financials: ["Capital", "Financial", "Holdings", "Trust", "Insurance", "Bancorp"],
  "Health Care": ["Health", "Biosciences", "Pharma", "Diagnostics", "Therapeutics", "Medical"],
  Energy: ["Energy", "Petroleum", "Resources", "Power", "Pipeline"],
  "Consumer Staples": ["Foods", "Beverages", "Household", "Provisions"],
  Industrials: ["Industries", "Manufacturing", "Aerospace", "Logistics", "Engineering"],
  Utilities: ["Utilities", "Electric", "Water", "Gas"],
  Materials: ["Materials", "Chemicals", "Mining", "Metals"],
  "Real Estate": ["Properties", "Realty", "REIT", "Estates"],
};

const NAME_SUFFIXES = ["Inc.", "Corp.", "Group", "Holdings Inc.", "Ltd.", "Co."];

function generateCompanyName(sector: (typeof SECTORS)[number]): string {
  const prefix = pick(NAME_PREFIXES);
  const core = pick(NAME_CORES[sector]);
  const suffix = pick(NAME_SUFFIXES);
  return `${prefix} ${core} ${suffix}`;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function generateTicker(): string | null {
  const len = randInt(0, 9) < 7 ? 4 : 3; // ~70% four-letter, ~30% three-letter
  let ticker = "";
  for (let i = 0; i < len; i++) {
    ticker += ALPHABET[randInt(0, 25)];
  }
  return claimSymbol(ticker);
}

interface GeneratedEquitySeed {
  symbol: string;
  initialPrice: number;
  volatility: number;
  sector: string;
  dailyVolume: number;
  name: string;
}

function generateEquities(count: number): GeneratedEquitySeed[] {
  const out: GeneratedEquitySeed[] = [];
  let attempts = 0;
  const maxAttempts = count * 20;
  while (out.length < count && attempts < maxAttempts) {
    attempts++;
    const symbol = generateTicker();
    if (!symbol) continue;
    const sector = weightedSector();
    // Log-normal-ish price spread: most names $10-$150, long tail to $2000.
    const priceRoll = rng();
    const initialPrice =
      priceRoll < 0.6
        ? round(10 + rng() * 90, 2)
        : priceRoll < 0.92
          ? round(100 + rng() * 300, 2)
          : round(400 + rng() * 1600, 2);
    // Volatility band by rough market-cap proxy (smaller/cheaper -> higher vol).
    const volatility =
      initialPrice < 30
        ? round(0.025 + rng() * 0.035, 4)
        : initialPrice < 150
          ? round(0.014 + rng() * 0.018, 4)
          : round(0.01 + rng() * 0.012, 4);
    // Higher-priced names trade fewer shares/day (real markets: BRK.A-style
    // thin volume at high price, penny-ish names churn heavily) — this also
    // keeps deriveMarketCapB's sqrt(volume)×price heuristic from blowing up.
    const dailyVolume = Math.round(
      (initialPrice < 30 ? 3_000_000 : initialPrice < 150 ? 1_200_000 : 250_000) *
        (0.3 + rng() * 1.6)
    );
    out.push({
      symbol,
      initialPrice,
      volatility,
      sector,
      dailyVolume,
      name: generateCompanyName(sector),
    });
  }
  if (out.length < count) {
    throw new Error(
      `generateEquities: only produced ${out.length}/${count} unique symbols after ${maxAttempts} attempts`
    );
  }
  return out;
}

// ─── FX ───────────────────────────────────────────────────────────────────

const FX_CURRENCIES: { code: string; name: string }[] = [
  { code: "MXN", name: "Mexican Peso" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "ZAR", name: "South African Rand" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "INR", name: "Indian Rupee" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "KRW", name: "South Korean Won" },
  { code: "CNH", name: "Chinese Yuan (Offshore)" },
  { code: "THB", name: "Thai Baht" },
  { code: "ILS", name: "Israeli Shekel" },
];

const FX_BASES = ["USD", "EUR", "GBP", "JPY"];

interface GeneratedFxSeed {
  symbol: string;
  initialPrice: number;
  volatility: number;
  dailyVolume: number;
  name: string;
}

function generateFx(count: number): GeneratedFxSeed[] {
  const out: GeneratedFxSeed[] = [];
  const pairs: { base: string; quote: string }[] = [];
  for (const base of FX_BASES) {
    for (const q of FX_CURRENCIES) {
      pairs.push({ base, quote: q.code });
    }
  }
  for (const pair of pairs) {
    if (out.length >= count) break;
    const symbol = claimSymbol(`${pair.base}/${pair.quote}`);
    if (!symbol) continue;
    const quoteInfo = FX_CURRENCIES.find((c) => c.code === pair.quote);
    const baseName = pair.base === "USD" ? "US Dollar" : pair.base === "EUR" ? "Euro" : pair.base === "GBP" ? "British Pound" : "Japanese Yen";
    // EM/minor pairs: wider price range, higher vol than G10 majors.
    const initialPrice = round(0.05 + rng() * 25, 4);
    const volatility = round(0.006 + rng() * 0.012, 4);
    out.push({
      symbol,
      initialPrice,
      volatility,
      dailyVolume: Math.round(5_000_000 + rng() * 60_000_000),
      name: `${baseName} / ${quoteInfo?.name ?? pair.quote}`,
    });
  }
  if (out.length < count) {
    throw new Error(`generateFx: only produced ${out.length}/${count} unique pairs`);
  }
  return out;
}

// ─── Commodities ────────────────────────────────────────────────────────────

const COMMODITY_SEEDS: { root: string; name: string; sector: string; price: number; vol: number }[] = [
  { root: "ZL", name: "Soybean Oil Front Month", sector: "Commodities/Agriculture", price: 45, vol: 0.018 },
  { root: "ZM", name: "Soybean Meal Front Month", sector: "Commodities/Agriculture", price: 320, vol: 0.017 },
  { root: "ZO", name: "Oats Front Month", sector: "Commodities/Agriculture", price: 3.6, vol: 0.02 },
  { root: "ZR", name: "Rough Rice Front Month", sector: "Commodities/Agriculture", price: 17, vol: 0.019 },
  { root: "CC", name: "Cocoa Front Month", sector: "Commodities/Agriculture", price: 8_500, vol: 0.03 },
  { root: "OJ", name: "Orange Juice Front Month", sector: "Commodities/Agriculture", price: 340, vol: 0.028 },
  { root: "LBS", name: "Lumber Front Month", sector: "Commodities/Materials", price: 550, vol: 0.035 },
  { root: "HE", name: "Lean Hogs Front Month", sector: "Commodities/Agriculture", price: 85, vol: 0.022 },
  { root: "LE", name: "Live Cattle Front Month", sector: "Commodities/Agriculture", price: 190, vol: 0.016 },
  { root: "GF", name: "Feeder Cattle Front Month", sector: "Commodities/Agriculture", price: 260, vol: 0.017 },
  { root: "HO", name: "Heating Oil Front Month", sector: "Commodities/Energy", price: 2.6, vol: 0.024 },
  { root: "BZ", name: "Brent Crude Oil Front Month", sector: "Commodities/Energy", price: 82, vol: 0.023 },
  { root: "ALI", name: "Aluminum Front Month", sector: "Commodities/Materials", price: 2_300, vol: 0.015 },
  { root: "ZNC", name: "Zinc Front Month", sector: "Commodities/Materials", price: 2_600, vol: 0.017 },
  { root: "NIC", name: "Nickel Front Month", sector: "Commodities/Materials", price: 17_500, vol: 0.024 },
  { root: "TIN", name: "Tin Front Month", sector: "Commodities/Materials", price: 26_000, vol: 0.02 },
  { root: "URA", name: "Uranium Front Month", sector: "Commodities/Energy", price: 84, vol: 0.03 },
  { root: "EUA", name: "EU Carbon Allowance Front Month", sector: "Commodities/Energy", price: 65, vol: 0.025 },
  { root: "MW", name: "Hard Red Spring Wheat Front Month", sector: "Commodities/Agriculture", price: 6.8, vol: 0.02 },
  { root: "DA", name: "Class III Milk Front Month", sector: "Commodities/Agriculture", price: 18.4, vol: 0.021 },
  { root: "IRON", name: "Iron Ore Front Month", sector: "Commodities/Materials", price: 110, vol: 0.026 },
];

interface GeneratedCommoditySeed {
  symbol: string;
  initialPrice: number;
  volatility: number;
  sector: string;
  dailyVolume: number;
  name: string;
}

function generateCommodities(count: number): GeneratedCommoditySeed[] {
  const out: GeneratedCommoditySeed[] = [];
  for (const c of COMMODITY_SEEDS) {
    if (out.length >= count) break;
    const symbol = claimSymbol(`${c.root}1!`);
    if (!symbol) continue;
    out.push({
      symbol,
      initialPrice: c.price,
      volatility: c.vol,
      sector: c.sector,
      dailyVolume: Math.round(20_000 + rng() * 180_000),
      name: c.name,
    });
  }
  if (out.length < count) {
    throw new Error(`generateCommodities: only produced ${out.length}/${count}, add more seeds to COMMODITY_SEEDS`);
  }
  return out;
}

// ─── Bonds ────────────────────────────────────────────────────────────────

const CORP_ISSUERS = [
  { ticker: "GS", name: "Goldman Sachs Group Inc.", sector: "Financials", rating: "A" },
  { ticker: "BAC", name: "Bank of America Corp.", sector: "Financials", rating: "A-" },
  { ticker: "WFC", name: "Wells Fargo & Co.", sector: "Financials", rating: "A-" },
  { ticker: "C", name: "Citigroup Inc.", sector: "Financials", rating: "BBB+" },
  { ticker: "PFE", name: "Pfizer Inc.", sector: "Health Care", rating: "AA-" },
  { ticker: "UNH", name: "UnitedHealth Group Inc.", sector: "Health Care", rating: "A+" },
  { ticker: "CVS", name: "CVS Health Corp.", sector: "Health Care", rating: "BBB" },
  { ticker: "WMT", name: "Walmart Inc.", sector: "Consumer Staples", rating: "AA" },
  { ticker: "PG", name: "Procter & Gamble Co.", sector: "Consumer Staples", rating: "AA-" },
  { ticker: "KO", name: "Coca-Cola Co.", sector: "Consumer Staples", rating: "A+" },
  { ticker: "PEP", name: "PepsiCo Inc.", sector: "Consumer Staples", rating: "A+" },
  { ticker: "HD", name: "Home Depot Inc.", sector: "Consumer Discretionary", rating: "A" },
  { ticker: "DIS", name: "Walt Disney Co.", sector: "Communication Services", rating: "A-" },
  { ticker: "VZ", name: "Verizon Communications Inc.", sector: "Communication Services", rating: "BBB+" },
  { ticker: "T", name: "AT&T Inc.", sector: "Communication Services", rating: "BBB" },
  { ticker: "BA", name: "Boeing Co.", sector: "Industrials", rating: "BBB-" },
  { ticker: "CAT", name: "Caterpillar Inc.", sector: "Industrials", rating: "A" },
  { ticker: "GE", name: "General Electric Co.", sector: "Industrials", rating: "BBB+" },
  { ticker: "CVX", name: "Chevron Corp.", sector: "Energy", rating: "AA-" },
  { ticker: "COP", name: "ConocoPhillips", sector: "Energy", rating: "A" },
  { ticker: "DUK", name: "Duke Energy Corp.", sector: "Utilities", rating: "BBB+" },
  { ticker: "SO", name: "Southern Co.", sector: "Utilities", rating: "BBB+" },
  { ticker: "NEE", name: "NextEra Energy Inc.", sector: "Utilities", rating: "A-" },
  { ticker: "LIN", name: "Linde plc", sector: "Materials", rating: "A" },
  { ticker: "SHW", name: "Sherwin-Williams Co.", sector: "Materials", rating: "BBB" },
];

const CREDIT_SPREAD_BPS: Record<string, number> = {
  AAA: 40,
  "AA+": 50,
  AA: 60,
  "AA-": 70,
  "A+": 85,
  A: 100,
  "A-": 115,
  "BBB+": 135,
  BBB: 155,
  "BBB-": 180,
  "BB+": 240,
  BB: 280,
};

const TENORS_YEARS = [1, 2, 3, 5, 7, 10, 15, 20, 30] as const;

function maturityFromYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

interface GeneratedBondSeed {
  isin: string;
  symbol: string;
  description: string;
  couponRate: number;
  maturityDate: string;
  periodsPerYear: number;
  totalPeriods: number;
  creditRating: string;
  issuer: "UST" | "Corp";
  sector?: string;
  initialYield: number;
  faceValue: number;
}

function isinCheckDigit(base: string): string {
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += base.charCodeAt(i);
  return String(sum % 10);
}

function generateBondIsin(prefix: string, seq: number): string {
  const base = `${prefix}${String(seq).padStart(9, "0")}`;
  return `${base}${isinCheckDigit(base)}`;
}

// Baseline UST curve yield by tenor (approximate, matches the existing
// hand-curated on-the-run points in bondUniverse.ts).
const UST_BASE_YIELD: Record<number, number> = {
  1: 0.051,
  2: 0.0488,
  3: 0.0462,
  5: 0.0435,
  7: 0.0432,
  10: 0.0445,
  15: 0.046,
  20: 0.048,
  30: 0.0468,
};

function generateBonds(count: number): GeneratedBondSeed[] {
  const out: GeneratedBondSeed[] = [];
  let ustSeq = 100;
  let corpSeq = 100;

  // Off-the-run UST notes/bonds at each tenor with slightly different
  // coupons/vintages than the on-the-run points already in BOND_UNIVERSE.
  const ustPerTenor = Math.ceil((count * 0.35) / TENORS_YEARS.length);
  for (const years of TENORS_YEARS) {
    for (let i = 0; i < ustPerTenor && out.length < count * 0.35; i++) {
      const symbol = claimSymbol(`US${years}Y-${String.fromCharCode(65 + i)}`);
      if (!symbol) continue;
      const baseYield = UST_BASE_YIELD[years] ?? 0.045;
      const initialYield = round(baseYield + (rng() - 0.5) * 0.006, 4);
      const couponRate = round(initialYield - (rng() - 0.5) * 0.002, 5);
      const totalPeriods = years * 2;
      out.push({
        isin: generateBondIsin("US9128", ustSeq++),
        symbol,
        description: `${years}-Year US Treasury ${years <= 1 ? "Bill" : years >= 20 ? "Bond" : "Note"} (off-the-run)`,
        couponRate,
        maturityDate: maturityFromYears(years),
        periodsPerYear: 2,
        totalPeriods,
        creditRating: "AAA",
        issuer: "UST",
        initialYield,
        faceValue: 1_000,
      });
    }
  }

  // Corporate bonds: multiple tenors per issuer.
  while (out.length < count) {
    const issuer = pick(CORP_ISSUERS);
    const years = pick(TENORS_YEARS.filter((y) => y <= 20));
    const symbol = claimSymbol(`${issuer.ticker}${years}Y-${corpSeq}`);
    if (!symbol) {
      corpSeq++;
      continue;
    }
    const baseYield = UST_BASE_YIELD[years] ?? 0.045;
    const spreadBps = CREDIT_SPREAD_BPS[issuer.rating] ?? 150;
    const initialYield = round(baseYield + spreadBps / 10_000 + (rng() - 0.5) * 0.003, 4);
    const couponRate = round(initialYield - (rng() - 0.5) * 0.002, 5);
    const totalPeriods = years * 2;
    out.push({
      isin: generateBondIsin("US0000", corpSeq++),
      symbol,
      description: `${issuer.name} ${years}-Year Senior Note`,
      couponRate,
      maturityDate: maturityFromYears(years),
      periodsPerYear: 2,
      totalPeriods,
      creditRating: issuer.rating,
      issuer: "Corp",
      sector: issuer.sector,
      initialYield,
      faceValue: 1_000,
    });
  }

  return out.slice(0, count);
}

// ─── Output ────────────────────────────────────────────────────────────────

function tsLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function writeEquities(): Promise<void> {
  const seeds = generateEquities(TARGET_NEW_EQUITIES);
  const path = new URL("../src/market-sim/generatedEquities.ts", import.meta.url);
  const lines: string[] = [
    "// Generated by backend/scripts/generate-instrument-universe.ts — do not hand-edit.",
    "// Synthetic equities appended to SP500_ASSETS to expand the simulated universe.",
    "",
    'import type { RawAssetSeed } from "./sp500Assets.ts";',
    "",
    "export const GENERATED_EQUITY_NAMES: Record<string, string> = {",
    ...seeds.map((s) => `  ${JSON.stringify(s.symbol)}: ${JSON.stringify(s.name)},`),
    "};",
    "",
    "export const GENERATED_EQUITIES: RawAssetSeed[] = [",
    ...seeds.map(
      (s) =>
        `  { symbol: ${JSON.stringify(s.symbol)}, initialPrice: ${s.initialPrice}, volatility: ${s.volatility}, sector: ${JSON.stringify(s.sector)}, dailyVolume: ${s.dailyVolume} },`
    ),
    "];",
    "",
  ];
  await Deno.writeTextFile(path, lines.join("\n"));
  console.log(`Wrote ${seeds.length} generated equities to ${path.pathname}`);
}

async function writeFx(): Promise<void> {
  const seeds = generateFx(TARGET_NEW_FX);
  const path = new URL("../src/market-sim/generatedFx.ts", import.meta.url);
  const lines: string[] = [
    "// Generated by backend/scripts/generate-instrument-universe.ts — do not hand-edit.",
    "// Synthetic FX crosses (minors/EM) appended to FX_ASSETS.",
    "",
    'import type { RawFxSeed } from "./fxAssets.ts";',
    "",
    "export const GENERATED_FX_NAMES: Record<string, string> = {",
    ...seeds.map((s) => `  ${JSON.stringify(s.symbol)}: ${JSON.stringify(s.name)},`),
    "};",
    "",
    "export const GENERATED_FX: RawFxSeed[] = [",
    ...seeds.map(
      (s) =>
        `  { symbol: ${JSON.stringify(s.symbol)}, initialPrice: ${s.initialPrice}, volatility: ${s.volatility}, dailyVolume: ${s.dailyVolume} },`
    ),
    "];",
    "",
  ];
  await Deno.writeTextFile(path, lines.join("\n"));
  console.log(`Wrote ${seeds.length} generated FX pairs to ${path.pathname}`);
}

async function writeCommodities(): Promise<void> {
  const seeds = generateCommodities(TARGET_NEW_COMMODITIES);
  const path = new URL("../src/market-sim/generatedCommodities.ts", import.meta.url);
  const lines: string[] = [
    "// Generated by backend/scripts/generate-instrument-universe.ts — do not hand-edit.",
    "// Synthetic commodity futures appended to COMMODITY_ASSETS.",
    "",
    'import type { RawCommoditySeed } from "./commodityAssets.ts";',
    "",
    "export const GENERATED_COMMODITY_NAMES: Record<string, string> = {",
    ...seeds.map((s) => `  ${JSON.stringify(s.symbol)}: ${JSON.stringify(s.name)},`),
    "};",
    "",
    "export const GENERATED_COMMODITIES: RawCommoditySeed[] = [",
    ...seeds.map(
      (s) =>
        `  { symbol: ${JSON.stringify(s.symbol)}, initialPrice: ${s.initialPrice}, volatility: ${s.volatility}, sector: ${JSON.stringify(s.sector)}, dailyVolume: ${s.dailyVolume} },`
    ),
    "];",
    "",
  ];
  await Deno.writeTextFile(path, lines.join("\n"));
  console.log(`Wrote ${seeds.length} generated commodities to ${path.pathname}`);
}

async function writeBonds(): Promise<void> {
  const seeds = generateBonds(TARGET_NEW_BONDS);
  const path = new URL("../../shared/generatedBondUniverse.ts", import.meta.url);
  const lines: string[] = [
    "// Generated by backend/scripts/generate-instrument-universe.ts — do not hand-edit.",
    "// Synthetic bonds (off-the-run UST + additional IG corporates) shared between",
    "// backend/src/market-sim/bondUniverse.ts and frontend/src/data/bondUniverse.ts",
    "// so both sides read one generated source instead of hand-duplicating records.",
    "",
    "import type { BondDef } from \"./bondUniverseTypes.ts\";",
    "",
    "export const GENERATED_BONDS: BondDef[] = " + tsLiteral(seeds) + ";",
    "",
  ];
  await Deno.writeTextFile(path, lines.join("\n"));
  console.log(`Wrote ${seeds.length} generated bonds to ${path.pathname}`);
}

if (import.meta.main) {
  await writeEquities();
  await writeFx();
  await writeCommodities();
  await writeBonds();
  console.log(
    `Done. New instruments: ${TARGET_NEW_EQUITIES} equities + ${TARGET_NEW_FX} FX + ${TARGET_NEW_COMMODITIES} commodities + ${TARGET_NEW_BONDS} bonds = ${
      TARGET_NEW_EQUITIES + TARGET_NEW_FX + TARGET_NEW_COMMODITIES + TARGET_NEW_BONDS
    } new (plus 287 existing = ${
      TARGET_NEW_EQUITIES + TARGET_NEW_FX + TARGET_NEW_COMMODITIES + TARGET_NEW_BONDS + 287
    } total).`
  );
}
