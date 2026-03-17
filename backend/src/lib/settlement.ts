/**
 * Settlement date utilities — shared across EMS, dark-pool, CCP, and RFQ services.
 *
 * Standard cycles:
 *   equity   — T+2 business days
 *   fi       — T+1 business day
 *   option   — T+1 business day
 *   otc      — T+0 (same day)
 */

export type Desk = "equity" | "fi" | "derivatives" | "otc";

const SETTLEMENT_DAYS: Record<Desk, number> = {
  equity:      2,
  fi:          1,
  derivatives: 1,
  otc:         0,
};

/**
 * Returns the settlement date as a YYYY-MM-DD string.
 * Skips weekends; does not account for public holidays.
 *
 * @param desk   — instrument class (default: "equity" → T+2)
 * @param fromMs — base timestamp in ms (default: now)
 */
export function settlementDate(desk: Desk = "equity", fromMs = Date.now()): string {
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
