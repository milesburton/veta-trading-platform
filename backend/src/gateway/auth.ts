import { logger } from "@veta/logger";
import type { AuthResult } from "./context.ts";

const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_NEGATIVE_TTL_MS = 10_000;
const AUTH_CACHE_PRUNE_MS = 30_000;
const AUTH_FAILURE_LOG_INTERVAL_MS = 60_000;

type CacheEntry =
  | { kind: "ok"; result: AuthResult; expiresAt: number }
  | { kind: "denied"; expiresAt: number };

const authCache = new Map<string, CacheEntry>();
const recentlyLoggedFailures = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of authCache) {
    if (entry.expiresAt <= now) authCache.delete(token);
  }
  for (const [token, ts] of recentlyLoggedFailures) {
    if (ts + AUTH_FAILURE_LOG_INTERVAL_MS <= now) {
      recentlyLoggedFailures.delete(token);
    }
  }
}, AUTH_CACHE_PRUNE_MS);

function maybeLogFailure(token: string, message: string): void {
  const key = token.slice(0, 8);
  const now = Date.now();
  const lastLogged = recentlyLoggedFailures.get(key);
  if (lastLogged && lastLogged + AUTH_FAILURE_LOG_INTERVAL_MS > now) return;
  recentlyLoggedFailures.set(key, now);
  logger.warn(message);
}

export function makeValidateToken(
  userServiceUrl: string,
): (token: string) => Promise<AuthResult | null> {
  return async function validateToken(token: string): Promise<AuthResult | null> {
    const now = Date.now();
    const cached = authCache.get(token);
    if (cached) {
      if (cached.expiresAt > now) {
        return cached.kind === "ok" ? cached.result : null;
      }
      authCache.delete(token);
    }
    try {
      const res = await fetch(`${userServiceUrl}/sessions/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        authCache.set(token, {
          kind: "denied",
          expiresAt: now + AUTH_NEGATIVE_TTL_MS,
        });
        maybeLogFailure(
          token,
          `validateToken: user-service returned ${res.status} for token ${
            token.slice(0, 8)
          }...: ${body}`,
        );
        return null;
      }
      const result = await res.json() as AuthResult;
      authCache.set(token, {
        kind: "ok",
        result,
        expiresAt: now + AUTH_CACHE_TTL_MS,
      });
      return result;
    } catch (err) {
      maybeLogFailure(
        token,
        `validateToken: fetch error for token ${token.slice(0, 8)}...: ${
          (err as Error).message
        }`,
      );
      return null;
    }
  };
}
