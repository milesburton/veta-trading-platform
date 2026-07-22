let prngState = 0;
let prngSeed: number | null = null;

function mulberry32(state: number): number {
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextRandom(): number {
  if (prngSeed === null) return Math.random();
  prngState = (prngState + 0x6d2b79f5) | 0;
  return mulberry32(prngState);
}

export function seedRng(seed: number | null): void {
  prngSeed = seed;
  prngState = seed ?? 0;
  bookPrngState = seed === null ? 0 : (seed ^ 0x9e3779b9) | 0;
}

export function currentSeed(): number | null {
  return prngSeed;
}

let bookPrngState = 0;

export function nextBookRandom(): number {
  if (prngSeed === null) return Math.random();
  bookPrngState = (bookPrngState + 0x6d2b79f5) | 0;
  return mulberry32(bookPrngState);
}

// fallow-ignore-next-line unused-export
export function __applyEnvSeedForTests(): void {
  const envSeed = Deno.env.get("MARKET_SIM_SEED");
  if (envSeed && envSeed.length > 0) {
    const parsed = Number(envSeed);
    if (Number.isFinite(parsed)) seedRng(parsed | 0);
  }
}

__applyEnvSeedForTests();
