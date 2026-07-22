import { BOND_ASSET_MAP, BOND_ASSETS } from "./bondAssets.ts";
import { COMMODITY_ASSET_MAP, COMMODITY_ASSETS } from "./commodityAssets.ts";
import { FX_ASSET_MAP, FX_ASSETS } from "./fxAssets.ts";
import { nextRandom } from "./rng.ts";
import { ASSET_MAP as EQUITY_ASSET_MAP, SP500_ASSETS } from "./sp500Assets.ts";

// docs: /platform/market-simulator/
// #region docs:gbm-constants
const TICKS_PER_DAY = 93_600;

const MEAN_REVERSION_SPEED = 0.0002;

const PRICE_FLOOR_RATIO = 0.1;

const SECTOR_CORRELATION = 0.35;
// #endregion docs:gbm-constants

const ALL_SEEDED_ASSETS = [...SP500_ASSETS, ...FX_ASSETS, ...COMMODITY_ASSETS, ...BOND_ASSETS];
const ALL_ASSET_MAP = new Map([
  ...EQUITY_ASSET_MAP,
  ...FX_ASSET_MAP,
  ...COMMODITY_ASSET_MAP,
  ...BOND_ASSET_MAP,
]);

export const marketData: Record<string, number> = Object.fromEntries(
  ALL_SEEDED_ASSETS.map((a) => [a.symbol, a.initialPrice])
);

/**
 * Session open prices — baseline for intraday % change. Set once before the
 * first live broadcast so late-connecting clients see the same day's move.
 */
export const openPrices: Record<string, number> = Object.fromEntries(
  ALL_SEEDED_ASSETS.map((a) => [a.symbol, a.initialPrice])
);

export function snapshotOpenPrices(): void {
  for (const sym of Object.keys(marketData)) {
    openPrices[sym] = marketData[sym];
  }
}

const anchorPrices: Record<string, number> = Object.fromEntries(
  ALL_SEEDED_ASSETS.map((a) => [a.symbol, a.initialPrice])
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
  regimeCountdown = 30 + Math.floor(nextRandom() * 270);
  const r = nextRandom();
  if (r < 0.4) marketDrift = 0;
  else if (r < 0.65) marketDrift = 0.0000008;
  else if (r < 0.85) marketDrift = -0.0000008;
  else if (r < 0.93) marketDrift = 0.0000025;
  else marketDrift = -0.0000025;
}

function randn(): number {
  const u1 = nextRandom();
  const u2 = nextRandom();
  return Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
}

export function advanceRegime() {
  if (--regimeCountdown <= 0) refreshRegime();
}

export function resetRegime(): void {
  marketDrift = 0;
  regimeCountdown = 0;
  for (const sector of Object.keys(sectorShocks)) delete sectorShocks[sector];
  refreshRegime();
}

let resetInProgress = false;

// docs: /platform/market-simulator/
// #region docs:reset-in-progress
export function isResetInProgress(): boolean {
  return resetInProgress;
}
// #endregion docs:reset-in-progress

export async function resetPriceEngine(opts: { prewarmTicks?: number } = {}): Promise<void> {
  resetInProgress = true;
  try {
    for (const a of ALL_SEEDED_ASSETS) {
      marketData[a.symbol] = a.initialPrice;
      anchorPrices[a.symbol] = a.initialPrice;
      openPrices[a.symbol] = a.initialPrice;
    }
    for (const sector of Object.keys(sectorShocks)) delete sectorShocks[sector];
    marketDrift = 0;
    regimeCountdown = 0;
    refreshRegime();
    await prewarmPricesAsync(opts.prewarmTicks ?? 240);
  } finally {
    resetInProgress = false;
  }
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

const PREWARM_CHUNK_TICKS = 200;

// docs: /platform/market-simulator/
// #region docs:prewarm-async
export async function prewarmPricesAsync(ticks = 28_080): Promise<void> {
  let done = 0;
  while (done < ticks) {
    const chunk = Math.min(PREWARM_CHUNK_TICKS, ticks - done);
    prewarmPrices(chunk);
    done += chunk;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
// #endregion docs:prewarm-async

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
    Math.sqrt(SECTOR_CORRELATION) * sectorShock + Math.sqrt(1 - SECTOR_CORRELATION) * idioShock;

  const logReturn =
    marketDrift + MEAN_REVERSION_SPEED * Math.log(anchor / current) + tickVol * combinedShock;

  let next = current * Math.exp(logReturn);
  const floor = anchor * PRICE_FLOOR_RATIO;
  if (next < floor) next = floor;

  marketData[asset] = parseFloat(next.toFixed(4));
  return marketData[asset];
}

refreshRegime();
