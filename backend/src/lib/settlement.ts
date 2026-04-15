import type { Desk } from "@veta/primitives";

export type { Desk } from "@veta/primitives";

const SETTLEMENT_DAYS: Record<Desk, number> = {
  equity: 2,
  fi: 1,
  derivatives: 1,
  fx: 2,
  commodities: 2,
};

export function settlementDate(
  desk: Desk = "equity",
  fromMs = Date.now(),
): string {
  const days = SETTLEMENT_DAYS[desk];
  if (days === 0) return new Date(fromMs).toISOString().slice(0, 10);

  const d = new Date(fromMs);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}
