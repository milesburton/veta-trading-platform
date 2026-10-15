import type { MarketTick } from "#veta/market-client";

export const TICK_VOLUME_TO_DEPTH_RATIO = 0.5;

export const DEPTH_PARTICIPATION = Number(process.env.ALGO_DEPTH_PARTICIPATION) || 0.5;

export function estimatedDepth(tick: Pick<MarketTick, "volumes">, asset: string): number {
  const tickVolume = tick.volumes[asset];
  return tickVolume && tickVolume > 0 ? tickVolume * TICK_VOLUME_TO_DEPTH_RATIO : 0;
}

export function depthSliceCap(
  tick: Pick<MarketTick, "volumes">,
  asset: string,
  participation: number = DEPTH_PARTICIPATION
): number {
  const depth = estimatedDepth(tick, asset);
  return depth > 0 ? Math.max(1, Math.floor(depth * participation)) : Number.POSITIVE_INFINITY;
}

export function capToDepth(
  requested: number,
  tick: Pick<MarketTick, "volumes">,
  asset: string,
  participation: number = DEPTH_PARTICIPATION
): number {
  return Math.min(requested, depthSliceCap(tick, asset, participation));
}
