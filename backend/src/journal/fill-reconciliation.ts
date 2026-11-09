export interface ArchivedExecution {
  execId: string;
  clOrdId: string;
  origClOrdId: string;
  symbol: string;
  side: string;
  cumQty: number;
  avgPx: number;
  lastQty: number;
  lastPx: number;
  leavesQty: number;
  commission: number;
  ts: number;
}

export function fillEventId(childId: string, execId: string): string {
  return `orders.filled:${childId}:${execId}`;
}

export function missingFillPayloads(
  executions: readonly ArchivedExecution[],
  existingEventIds: ReadonlySet<string>
): Record<string, unknown>[] {
  return executions
    .filter((ex) => !existingEventIds.has(fillEventId(ex.clOrdId, ex.execId)))
    .map((ex) => ({
      execId: ex.execId,
      childId: ex.clOrdId,
      parentOrderId: ex.origClOrdId,
      asset: ex.symbol,
      side: ex.side === "1" ? "BUY" : "SELL",
      filledQty: ex.lastQty,
      avgFillPrice: ex.lastPx,
      remainingQty: ex.leavesQty,
      commissionUSD: ex.commission,
      ts: ex.ts,
      _reconciled: true,
    }));
}
