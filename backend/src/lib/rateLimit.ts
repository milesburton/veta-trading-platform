export interface RateLimitConfig {
  capacity: number;
  refillPerSecond: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class RateLimiter {
  readonly #config: RateLimitConfig;
  readonly #buckets = new Map<string, Bucket>();
  #lastSweepMs = 0;

  constructor(config: RateLimitConfig) {
    this.#config = config;
  }

  consume(key: string, now: number = Date.now()): { allowed: boolean; retryAfterMs: number } {
    this.#sweepIfStale(now);
    const bucket = this.#getOrCreate(key, now);
    this.#refill(bucket, now);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfterMs: 0 };
    }
    const tokensShort = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil((tokensShort / this.#config.refillPerSecond) * 1000);
    return { allowed: false, retryAfterMs };
  }

  size(): number {
    return this.#buckets.size;
  }

  #getOrCreate(key: string, now: number): Bucket {
    const existing = this.#buckets.get(key);
    if (existing) return existing;
    const bucket: Bucket = { tokens: this.#config.capacity, lastRefillMs: now };
    this.#buckets.set(key, bucket);
    return bucket;
  }

  #refill(bucket: Bucket, now: number): void {
    const elapsedMs = now - bucket.lastRefillMs;
    if (elapsedMs <= 0) return;
    const refilled = (elapsedMs / 1000) * this.#config.refillPerSecond;
    bucket.tokens = Math.min(this.#config.capacity, bucket.tokens + refilled);
    bucket.lastRefillMs = now;
  }

  #sweepIfStale(now: number): void {
    if (now - this.#lastSweepMs < 60_000) return;
    this.#lastSweepMs = now;
    const fullAfterMs = (this.#config.capacity / this.#config.refillPerSecond) * 1000;
    const stale = [...this.#buckets].filter(([, bucket]) =>
      now - bucket.lastRefillMs > fullAfterMs * 4
    );
    stale.forEach(([key]) => this.#buckets.delete(key));
  }
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function rateLimitResponse(retryAfterMs: number): Response {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new Response(
    JSON.stringify({ error: "rate_limited", retryAfterSeconds: retryAfterSec }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
