import { logger } from "#veta/logger";
import { type CheckRequest, type CheckResult, CheckResultSchema } from "#veta/schemas/risk";

export const RISK_UNAVAILABLE_REASON =
  "Risk engine unavailable, all orders are blocked until the risk service is restored";

const CHECK_TIMEOUT_MS = 3_000;

const blocked = (): CheckResult => ({
  allowed: false,
  reasons: [RISK_UNAVAILABLE_REASON],
  warnings: [],
});

export async function checkRisk(
  riskEngineUrl: string,
  req: CheckRequest,
  fetchImpl: typeof fetch = fetch
): Promise<CheckResult> {
  try {
    const res = await fetchImpl(`${riskEngineUrl}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.error(`risk-engine /check returned ${res.status}`);
      return blocked();
    }
    const parsed = CheckResultSchema.safeParse(await res.json());
    if (!parsed.success) {
      logger.error("risk-engine /check returned a response that breaks the contract", {
        detail: parsed.error.message,
      });
      return blocked();
    }
    return parsed.data;
  } catch (err) {
    logger.error("risk-engine unreachable", { detail: err });
    return blocked();
  }
}
