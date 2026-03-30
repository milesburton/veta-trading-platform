import { ASSET_MAP as EQUITY_ASSET_MAP, SP500_ASSETS } from "./sp500Assets.ts";
import { FX_ASSETS, FX_ASSET_MAP } from "./fxAssets.ts";
import { COMMODITY_ASSETS, COMMODITY_ASSET_MAP } from "./commodityAssets.ts";
import { BOND_ASSETS, BOND_ASSET_MAP } from "./bondAssets.ts";

// 4 ticks/s × 390 min × 60 s/min — scaling daily vol by 1/√N gives
// fine-grained steps that accumulate realistically over 1-min candles.
const TICKS_PER_DAY = 93_600;

// Ornstein-Uhlenbeck κ: reverts over ~5000 ticks (≈1.25 trading hours).
const MEAN_REVERSION_SPEED = 0.0002;

const PRICE_FLOOR_RATIO = 0.10;

// Fraction of each tick's random shock shared with the sector.
const SECTOR_CORRELATION = 0.35;

const ALL_SEEDED_ASSETS = [...SP500_ASSETS, ...FX_ASSETS, ...COMMODITY_ASSETS, ...BOND_ASSETS];
const ALL_ASSET_MAP = new Map([...EQUITY_ASSET_MAP, ...FX_ASSET_MAP, ...COMMODITY_ASSET_MAP, ...BOND_ASSET_MAP]);

export const marketData: Record<string, number> = Object.fromEntries(
  ALL_SEEDED_ASSETS.map((a) => [a.symbol, a.initialPrice]),
);

/**
 * Session open prices — baseline for intraday % change. Set once before the
 * first live broadcast so late-connecting clients see the same day's move.
 */
export const openPrices: Record<string, number> = Object.fromEntries(
  ALL_SEEDED_ASSETS.map((a) => [a.symbol, a.initialPrice]),
);

export function snapshotOpenPrices(): void {
  for (const sym of Object.keys(marketData)) {
    openPrices[sym] = marketData[sym];
  }
}

const anchorPrices: Record<string, number> = Object.fromEntries(
  ALL_SEEDED_ASSETS.map((a) => [a.symbol, a.initialPrice]),
);

export function seedPrice(symbol: string, price: number): void {
  if (price > 0 && symbol in marketData) {
    marketData[symbol] = price;
    anchorPrices[symbol] = price;
  }
}

const sectorShocks: Record<string, number> = {};

let marketDrift = 0;
let regimeCountdown = 0;

function refreshRegime() {
  regimeCountdown = 30 + Math.floor(Math.random() * 270);
  const r = Math.random();
  if (r < 0.40) marketDrift = 0;
  else if (r < 0.65) marketDrift = 0.0000008;
  else if (r < 0.85) marketDrift = -0.0000008;
  else if (r < 0.93) marketDrift = 0.0000025;
  else marketDrift = -0.0000025;
}

function randn(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
}

export function advanceRegime() {
  if (--regimeCountdown <= 0) refreshRegime();
}

/** Run `ticks` silent GBM steps so prices start with realistic intraday drift. */
export function prewarmPrices(ticks = 28_080): void {
  for (let i = 0; i < ticks; i++) {
    advanceRegime();
    refreshSectorShocks();
    for (const asset of Object.keys(marketData)) {
      generatePrice(asset);
    }
  }
}

export function refreshSectorShocks() {
  const sectors = new Set(ALL_SEEDED_ASSETS.map((a) => a.sector));
  for (const sector of sectors) {
    sectorShocks[sector] = randn();
  }
}

/** GBM step with mean reversion, sector correlation, regime drift, and price floor. */
export function generatePrice(asset: string): number {
  const def = ALL_ASSET_MAP.get(asset);
  const dailyVol = def?.volatility ?? 0.02;
  const sector = def?.sector ?? "Unknown";
  const anchor = anchorPrices[asset];
  const current = marketData[asset];

  const tickVol = dailyVol / Math.sqrt(TICKS_PER_DAY);
  const idioShock = randn();
  const sectorShock = sectorShocks[sector] ?? 0;
  const combinedShock =
    Math.sqrt(SECTOR_CORRELATION) * sectorShock +
    Math.sqrt(1 - SECTOR_CORRELATION) * idioShock;

  const logReturn = marketDrift +
    MEAN_REVERSION_SPEED * Math.log(anchor / current) +
    tickVol * combinedShock;

  let next = current * Math.exp(logReturn);
  const floor = anchor * PRICE_FLOOR_RATIO;
  if (next < floor) next = floor;

  marketData[asset] = parseFloat(next.toFixed(4));
  return marketData[asset];
}

refreshRegime();
