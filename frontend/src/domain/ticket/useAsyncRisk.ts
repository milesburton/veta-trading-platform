import { useCallback, useEffect, useRef, useState } from "react";
import { checkPreTradeRisk, type RiskCheckResult, shouldTriggerRiskCheck } from "./async-risk";
import type { TicketContext } from "./ticket-types";

const DEBOUNCE_MS = 800;

const IDLE_RESULT: RiskCheckResult = { status: "idle", diagnostics: [] };

export function useAsyncRisk(ctx: TicketContext): RiskCheckResult {
  const [result, setResult] = useState<RiskCheckResult>(IDLE_RESULT);
  const prevCtxRef = useRef<TicketContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  const runCheck = useCallback(async (context: TicketContext) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setResult({ status: "pending", diagnostics: [] });

    const checkResult = await checkPreTradeRisk(context);
    setResult(checkResult);
  }, []);

  useEffect(() => {
    if (!shouldTriggerRiskCheck(prevCtxRef.current, ctx)) return;

    prevCtxRef.current = ctx;
    clearTimeout(timerRef.current);

    if (!ctx.userId || !ctx.instrument.symbol || ctx.draft.quantity <= 0) {
      setResult(IDLE_RESULT);
      return;
    }

    timerRef.current = setTimeout(() => runCheck(ctx), DEBOUNCE_MS);

    return () => clearTimeout(timerRef.current);
  }, [ctx, runCheck]);

  return result;
}
