/**
 * Implied volatility surface.
 *
 * Generates a 5×9 implied vol surface (5 expiries × 9 strikes) using a
 * SABR-inspired skew model:
 *
 *   σ_impl(K, T) = σ_ATM × (1 + skew × ln(K/F) + curvature × ln(K/F)²)
 *
 * where:
 *   σ_ATM  = EWMA vol (annualised, from volatility-estimator)
 *   F      = spot price (forward ≈ spot for illustration)
 *   skew   = -0.10  (equity put skew — OTM puts command higher IV)
 *   curvature = 0.05 (smile — both deep ITM and OTM have higher IV than ATM)
 *
 * Expiries: 7d, 14d, 30d, 60d, 90d
 * Moneynesses: 0.70, 0.775, 0.85, 0.925, 1.00, 1.075, 1.15, 1.225, 1.30
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VolSurfacePoint {
  expirySecs: number;
  expiryLabel: string;   // "7d", "14d", "30d", "60d", "90d"
  moneyness: number;     // K / F
  strike: number;        // absolute strike price
  impliedVol: number;    // annualised σ_impl(K, T)
}

export interface VolSurfaceResponse {
  symbol: string;
  spotPrice: number;
  atTheMoneyVol: number;  // EWMA vol used as ATM base
  expiries: number[];     // [7d, 14d, 30d, 60d, 90d] in secs
  moneynesses: number[];  // strike / spot levels
  surface: VolSurfacePoint[];  // flat array, length = 45
  computedAt: number;
}

// ── Surface parameters ────────────────────────────────────────────────────────

const EXPIRY_DAYS = [7, 14, 30, 60, 90];
const EXPIRY_SECS = EXPIRY_DAYS.map((d) => d * 86_400);
const EXPIRY_LABELS = ["7d", "14d", "30d", "60d", "90d"];
const MONEYNESSES = [0.70, 0.775, 0.85, 0.925, 1.00, 1.075, 1.15, 1.225, 1.30];

// Equity skew: negative slope (puts more expensive than calls at same distance from ATM)
const SKEW = -0.10;
// Smile curvature: both deep ITM and OTM trade at higher IV than ATM
const CURVATURE = 0.05;

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Build the implied volatility surface for a given symbol and ATM vol.
 *
 * @param symbol       Underlying symbol (for labelling)
 * @param spot         Current spot price
 * @param atTheMoneyVol  Annualised EWMA implied vol at the money
 */
export function buildVolSurface(
  symbol: string,
  spot: number,
  atTheMoneyVol: number,
): VolSurfaceResponse {
  const F = spot; // Forward ≈ spot (risk-neutral rate adjustment omitted for clarity)
  const surface: VolSurfacePoint[] = [];

  for (let ei = 0; ei < EXPIRY_SECS.length; ei++) {
    const expirySecs = EXPIRY_SECS[ei];
    const expiryLabel = EXPIRY_LABELS[ei];

    for (const moneyness of MONEYNESSES) {
      const K = F * moneyness;
      const logMoneyness = Math.log(K / F); // = ln(moneyness), 0 at ATM

      // SABR-inspired smile: skew term gives put skew, curvature adds smile bowl
      const impliedVol = Math.max(
        0.01, // floor at 1% to prevent degenerate pricing
        atTheMoneyVol * (1 + SKEW * logMoneyness + CURVATURE * logMoneyness * logMoneyness),
      );

      surface.push({
        expirySecs,
        expiryLabel,
        moneyness,
        strike: Math.round(K * 100) / 100, // round to cents
        impliedVol,
      });
    }
  }

  return {
    symbol,
    spotPrice: spot,
    atTheMoneyVol,
    expiries: EXPIRY_SECS,
    moneynesses: MONEYNESSES,
    surface,
    computedAt: Date.now(),
  };
}
