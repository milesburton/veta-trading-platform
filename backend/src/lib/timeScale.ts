export const TIME_SCALE = Number(Deno.env.get("TIME_SCALE")) || 60;

export const TRADING_DAY_MINUTES = 390;

export function currentMarketMinute(): number {
  const elapsedSecs = (Date.now() / 1_000) % ((TRADING_DAY_MINUTES * (1_000 / TIME_SCALE)) / 1_000);
  return Math.floor(elapsedSecs * TIME_SCALE) % TRADING_DAY_MINUTES;
}

// docs: /platform/market-simulator/
// #region docs:intraday-volume-curve
export function intradayVolumeFactor(marketMinute: number): number {
  const x = marketMinute / TRADING_DAY_MINUTES;
  const cos = Math.cos(Math.PI * x);
  return 0.3 + 0.7 * cos * cos;
}
// #endregion docs:intraday-volume-curve

export function realMsToMarketMinutes(ms: number): number {
  return (ms / 1_000) * TIME_SCALE;
}
