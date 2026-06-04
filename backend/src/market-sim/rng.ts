let prngState = 0;
let prngSeed: number | null = null;

function mulberry32(): number {
  prngState = (prngState + 0x6d2b79f5) | 0;
  let t = prngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextRandom(): number {
  return prngSeed === null ? Math.random() : mulberry32();
}

export function seedRng(seed: number | null): void {
  prngSeed = seed;
  prngState = seed ?? 0;
}

export function currentSeed(): number | null {
  return prngSeed;
}

export function __applyEnvSeedForTests(): void {
  const envSeed = Deno.env.get("MARKET_SIM_SEED");
  if (envSeed && envSeed.length > 0) {
    const parsed = Number(envSeed);
    if (Number.isFinite(parsed)) seedRng(parsed | 0);
  }
}

__applyEnvSeedForTests();
