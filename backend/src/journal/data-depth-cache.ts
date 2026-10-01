export interface SingleFlightCache<T> {
  get(): Promise<T>;
}

export function createSingleFlightCache<T>(
  load: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now
): SingleFlightCache<T> {
  let cached: { value: T; at: number } | null = null;
  let inFlight: Promise<T> | null = null;

  return {
    get(): Promise<T> {
      if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.value);
      if (inFlight) return inFlight;
      inFlight = load()
        .then((value) => {
          cached = { value, at: now() };
          return value;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}
