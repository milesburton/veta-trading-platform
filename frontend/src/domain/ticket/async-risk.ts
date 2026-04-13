import type { OrderSide } from "../../types.ts";
import type { Diagnostic, TicketContext } from "./ticket-types";

export type RiskCheckStatus = "idle" | "pending" | "approved" | "rejected" | "error";

export interface RiskCheckResult {
  status: RiskCheckStatus;
  diagnostics: Diagnostic[];
  checkedAt?: number;
}

export interface PreTradeRiskRequest {
  userId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  limitPrice: number;
  notional: number;
  strategy: string;
}

export interface PreTradeRiskResponse {
  approved: boolean;
  violations: Array<{
    ruleId: string;
    message: string;
    severity: "error" | "warning";
  }>;
}

const GATEWAY_URL =
  typeof window !== "undefined"
    ? (import.meta.env?.VITE_GATEWAY_URL ?? "/api/gateway")
    : "/api/gateway";

export async function checkPreTradeRisk(ctx: TicketContext): Promise<RiskCheckResult> {
  const { draft, instrument, userId } = ctx;

  if (!userId || !instrument.symbol || draft.quantity <= 0 || draft.limitPrice <= 0) {
    return { status: "idle", diagnostics: [] };
  }

  const request: PreTradeRiskRequest = {
    userId,
    symbol: instrument.symbol,
    side: draft.side,
    quantity: draft.quantity,
    limitPrice: draft.limitPrice,
    notional: draft.quantity * draft.limitPrice,
    strategy: draft.strategy,
  };

  try {
    const res = await fetch(`${GATEWAY_URL}/risk/pre-trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(3_000),
    });

    if (!res.ok) {
      return {
        status: "error",
        diagnostics: [
          {
            field: "*",
            severity: "warning",
            message: "Pre-trade risk check unavailable",
            ruleId: "risk.service-error",
          },
        ],
      };
    }

    const data = (await res.json()) as PreTradeRiskResponse;
    const diagnostics: Diagnostic[] = data.violations.map((v) => ({
      field: "*",
      severity: v.severity,
      message: v.message,
      ruleId: `risk.${v.ruleId}`,
    }));

    return {
      status: data.approved ? "approved" : "rejected",
      diagnostics,
      checkedAt: Date.now(),
    };
  } catch {
    return {
      status: "error",
      diagnostics: [
        {
          field: "*",
          severity: "warning",
          message: "Pre-trade risk check timed out",
          ruleId: "risk.timeout",
        },
      ],
    };
  }
}

export function shouldTriggerRiskCheck(prev: TicketContext | null, next: TicketContext): boolean {
  if (!prev) return true;
  return (
    prev.draft.quantity !== next.draft.quantity ||
    prev.draft.limitPrice !== next.draft.limitPrice ||
    prev.draft.side !== next.draft.side ||
    prev.draft.strategy !== next.draft.strategy ||
    prev.instrument.symbol !== next.instrument.symbol
  );
}
