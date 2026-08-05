/** Quantity not already committed to child orders and therefore safe to route. */
export function availableSniperQty(totalRemaining: number, inFlightQty: number): number {
  return Math.max(0, totalRemaining - inFlightQty);
}
