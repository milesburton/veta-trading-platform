import { logger } from "@veta/logger";

export interface RiskCheckRequest {
  orderId: string;
  userId: string;
  userRole: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  strategy?: string;
}

export interface RiskCheckResult {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
}

/**
 * Calls risk-engine's existing POST /check directly (Option B from the FIX
 * remediation plan) rather than routing the order through orders.new/OMS —
 * that fuller integration is deliberately deferred (see ADR 0004). The
 * endpoint itself is caller-agnostic: this is the same request/response
 * shape oms-server.ts already sends, so no risk-engine changes were
 * needed to support this caller.
 *
 * Fails closed on any error (timeout, network, non-2xx, malformed body),
 * mirroring oms-server.ts's posture exactly — an unreachable risk-engine
 * blocks orders rather than letting them through unchecked.
 */
export async function checkRisk(
  riskEngineUrl: string,
  req: RiskCheckRequest,
  fetchImpl: typeof fetch = fetch
): Promise<RiskCheckResult> {
  try {
    const res = await fetchImpl(`${riskEngineUrl}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) {
      logger.error(`[FIX Exchange] risk-engine /check returned ${res.status}`);
      return {
        allowed: false,
        reasons: ["Risk engine unavailable — all orders are blocked until the risk service is restored"],
        warnings: [],
      };
    }
    const body = (await res.json()) as Partial<RiskCheckResult>;
    if (typeof body.allowed !== "boolean") {
      logger.error("[FIX Exchange] risk-engine /check returned a malformed response");
      return {
        allowed: false,
        reasons: ["Risk engine unavailable — all orders are blocked until the risk service is restored"],
        warnings: [],
      };
    }
    return {
      allowed: body.allowed,
      reasons: body.reasons ?? [],
      warnings: body.warnings ?? [],
    };
  } catch (err) {
    logger.error("[FIX Exchange] risk-engine unreachable", { detail: err });
    return {
      allowed: false,
      reasons: ["Risk engine unavailable — all orders are blocked until the risk service is restored"],
      warnings: [],
    };
  }
}
