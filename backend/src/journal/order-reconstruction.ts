type Row = readonly unknown[];
type Order = Record<string, unknown>;
type Child = Record<string, unknown>;

const DAY_MS = 86_400_000;

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toMs(ts: unknown): number {
  return ts instanceof Date ? ts.getTime() : Number(ts);
}

function rawOf(raw: unknown): Record<string, unknown> {
  return (raw ?? {}) as Record<string, unknown>;
}

function newOrder(row: Row): Order {
  const [orderId, eventType, ts, instrument, side, quantity, limitPrice, algo, userId, algoParams, raw] =
    row;
  const tsMs = toMs(ts);
  const rawObj = rawOf(raw);
  const submitted = eventType === "orders.submitted";
  const strategy = algo ?? rawObj.strategy ?? "LIMIT";
  return {
    id: (rawObj.clientOrderId as string | undefined) ?? orderId,
    submittedAt: tsMs,
    asset: instrument ?? rawObj.asset ?? "",
    side: side ?? rawObj.side ?? "BUY",
    quantity: toNumber(quantity ?? rawObj.quantity ?? rawObj.requestedQty),
    limitPrice: toNumber(limitPrice ?? rawObj.limitPrice),
    expiresAt: submitted && rawObj.expiresAt !== undefined
      ? tsMs + Number(rawObj.expiresAt) * 1_000
      : tsMs + DAY_MS,
    strategy,
    status: submitted ? "pending" : "rejected",
    rejectReason: submitted ? undefined : (rawObj.reason ?? rawObj.message ?? null),
    filled: 0,
    algoParams: algoParams ?? { strategy },
    userId: userId ?? rawObj.userId ?? null,
    children: [],
  };
}

function applyStructureEvent(order: Order, row: Row): Order {
  const eventType = row[1];
  if (eventType === "orders.routed") {
    return order.status === "pending" ? { ...order, status: "working" } : order;
  }
  if (eventType === "orders.expired") return { ...order, status: "expired" };
  if (eventType === "orders.rejected") {
    const reason = rawOf(row[10]).reason;
    return { ...order, status: "rejected", ...(reason ? { rejectReason: reason } : {}) };
  }
  return order;
}

function applyChild(order: Order, row: Row): Order {
  const [, , , side, quantity, limitPrice, , childId] = row;
  const child: Child = {
    id: childId ?? "",
    side: side ?? order.side,
    quantity: toNumber(quantity),
    limitPrice: toNumber(limitPrice),
    filledQty: 0,
    avgFillPrice: 0,
    commissionUSD: 0,
    status: "pending",
  };
  return {
    ...order,
    children: [...(order.children as Child[]), child],
    status: order.status === "pending" ? "working" : order.status,
  };
}

function applyFill(order: Order, row: Row): Order {
  const [, , , , , , filledQty, childId, fillPrice] = row;
  const qty = toNumber(filledQty);
  const filled = toNumber(order.filled) + qty;
  const orderQty = toNumber(order.quantity);
  const children = (order.children as Child[]).map((c) => {
    if (!childId || c.id !== childId) return c;
    const childFilled = toNumber(c.filledQty) + qty;
    return {
      ...c,
      filledQty: childFilled,
      filled: childFilled,
      status: "filled",
      ...(fillPrice !== null && fillPrice !== undefined ? { avgFillPrice: toNumber(fillPrice) } : {}),
    };
  });
  return {
    ...order,
    filled,
    status: orderQty > 0 && filled >= orderQty ? "filled" : "working",
    children,
  };
}

export function reconstructOrdersFromRows(
  structureRows: readonly Row[],
  activityRows: readonly Row[]
): Order[] {
  const afterStructure = structureRows.reduce((orders, row) => {
    const orderId = row[0] as string;
    const eventType = row[1];
    const existing = orders.get(orderId);
    if (eventType === "orders.submitted" || (eventType === "orders.rejected" && !existing)) {
      return orders.set(orderId, newOrder(row));
    }
    return existing ? orders.set(orderId, applyStructureEvent(existing, row)) : orders;
  }, new Map<string, Order>());

  const afterActivity = activityRows.reduce((orders, row) => {
    const orderId = row[0] as string;
    const existing = orders.get(orderId);
    if (!existing) return orders;
    if (row[1] === "orders.filled") return orders.set(orderId, applyFill(existing, row));
    if (row[1] === "orders.child") return orders.set(orderId, applyChild(existing, row));
    return orders;
  }, afterStructure);

  return [...afterActivity.values()].sort(
    (a, b) => Number(b.submittedAt) - Number(a.submittedAt)
  );
}
