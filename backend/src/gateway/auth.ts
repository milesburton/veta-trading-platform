import { logger } from "@veta/logger";
import type { AuthResult } from "./context.ts";

const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_CACHE_PRUNE_MS = 30_000;

const authCache = new Map<string, { result: AuthResult; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of authCache) {
    if (entry.expiresAt <= now) authCache.delete(token);
  }
}, AUTH_CACHE_PRUNE_MS);

export function makeValidateToken(
  userServiceUrl: string,
): (token: string) => Promise<AuthResult | null> {
  return async function validateToken(token: string): Promise<AuthResult | null> {
    const now = Date.now();
    const cached = authCache.get(token);
    if (cached) {
      if (cached.expiresAt > now) return cached.result;
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
        logger.warn(
          `validateToken: user-service returned ${res.status} for token ${
            token.slice(0, 8)
          }...: ${body}`,
        );
        return null;
      }
      const result = await res.json() as AuthResult;
      authCache.set(token, { result, expiresAt: now + AUTH_CACHE_TTL_MS });
      return result;
    } catch (err) {
      logger.warn(
        `validateToken: fetch error for token ${token.slice(0, 8)}...`,
        { err: err as Error },
      );
      return null;
    }
  };
}
