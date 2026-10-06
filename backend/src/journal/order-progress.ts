export interface OrderProgressSummary {
  readonly orderId: string;
  readonly filledQty: number;
  readonly avgFillPrice: number;
  readonly filledChildIds: readonly string[];
}

export function summariseFills(
  orderId: string,
  rows: readonly (readonly unknown[])[]
): OrderProgressSummary {
  const fills = rows.map(([childId, filledQty, fillPrice]) => ({
    childId: typeof childId === "string" ? childId : null,
    qty: Number(filledQty ?? 0) || 0,
    price: Number(fillPrice ?? 0) || 0,
  }));
  const filledQty = fills.reduce((sum, f) => sum + f.qty, 0);
  const notional = fills.reduce((sum, f) => sum + f.qty * f.price, 0);
  return {
    orderId,
    filledQty,
    avgFillPrice: filledQty > 0 ? Number((notional / filledQty).toFixed(4)) : 0,
    filledChildIds: fills.flatMap((f) => (f.childId ? [f.childId] : [])),
  };
}

export function decodeOrderId(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
