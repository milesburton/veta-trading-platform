export type Side = "BUY" | "SELL";

interface OpenOrder {
  clientOrderId: string;
  asset: string;
  side: Side;
  quantity: number;
  limitPrice?: number;
}

export class PositionTracker {
  #openByClientOrderId = new Map<string, OpenOrder>();

  recordAck(order: { clientOrderId?: string; asset: string; side: Side; quantity: number; limitPrice?: number }): void {
    if (!order.clientOrderId) return;
    this.#openByClientOrderId.set(order.clientOrderId, {
      clientOrderId: order.clientOrderId,
      asset: order.asset,
      side: order.side,
      quantity: order.quantity,
      limitPrice: order.limitPrice,
    });
  }

  recordTerminal(clientOrderId: string | null | undefined): void {
    if (!clientOrderId) return;
    this.#openByClientOrderId.delete(clientOrderId);
  }

  hasOpenOpposite(asset: string, side: Side): boolean {
    const opposite: Side = side === "BUY" ? "SELL" : "BUY";
    for (const order of this.#openByClientOrderId.values()) {
      if (order.asset === asset && order.side === opposite) return true;
    }
    return false;
  }

  openOrderCount(): number {
    return this.#openByClientOrderId.size;
  }

  notionalByAsset(): Map<string, number> {
    const result = new Map<string, number>();
    for (const order of this.#openByClientOrderId.values()) {
      const price = order.limitPrice ?? 0;
      const notional = order.quantity * price;
      result.set(order.asset, (result.get(order.asset) ?? 0) + notional);
    }
    return result;
  }

  pickLeastConcentrated(candidates: readonly string[]): string {
    if (candidates.length === 0) {
      throw new Error("pickLeastConcentrated requires at least one candidate");
    }
    const notional = this.notionalByAsset();
    let best = candidates[0];
    let bestNotional = notional.get(best) ?? 0;
    for (const asset of candidates) {
      const value = notional.get(asset) ?? 0;
      if (value < bestNotional) {
        best = asset;
        bestNotional = value;
      }
    }
    return best;
  }
}
