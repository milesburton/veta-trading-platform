/**
 * Rule-based trade recommendation engine for options.
 *
 * Evaluates a set of named signal rules for each option candidate and
 * produces a score (-100 to +100) mapped to a signal strength band.
 */

import { blackScholes } from "./black-scholes.ts";
import type {
  OptionType,
  Recommendation,
  SignalReason,
  SignalStrength,
} from "./types.ts";

// ── Score → signal band ───────────────────────────────────────────────────────

function scoreToStrength(score: number): SignalStrength {
  if (score >= 60) return "STRONG_BUY";
  if (score >= 20) return "BUY";
  if (score > -20) return "NEUTRAL";
  if (score > -60) return "SELL";
  return "STRONG_SELL";
}

// ── Scoring rules ─────────────────────────────────────────────────────────────

interface RuleResult {
  reason: SignalReason;
  delta: number;  // contribution to score (-100 to +100 range)
}

function evaluateRules(
  optionType: OptionType,
  S: number,
  K: number,
  T: number,        // years
  sigma: number,
  price: number,
  delta: number,
  theta: number,
  vega: number,
): RuleResult[] {
  const results: RuleResult[] = [];
  const moneyness = S / K;           // >1 = ITM for call, <1 = ITM for put
  const daysToExpiry = T * 365;
  const isCall = optionType === "call";

  // 1. Deep ITM — delta near ±1, option behaves like stock; lower leverage appeal
  const absDelta = Math.abs(delta);
  if (absDelta > 0.85) {
    results.push({ reason: "DEEP_ITM", delta: isCall ? -15 : -15 });
  }

  // 2. Deep OTM — low probability of profit
  if (absDelta < 0.10) {
    results.push({ reason: "DEEP_OTM", delta: -25 });
  }

  // 3. ATM + high vol — high premium but good gamma exposure
  const isNearATM = Math.abs(moneyness - 1) < 0.05;
  if (isNearATM && sigma > 0.30) {
    results.push({ reason: "ATM_HIGH_VOL", delta: 15 });
  }

  // 4. Low time value (intrinsic dominates) — little optionality premium
  const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  const timeValue = Math.max(0, price - intrinsic);
  if (timeValue < price * 0.1 && price > 0) {
    results.push({ reason: "LOW_TIME_VALUE", delta: -10 });
  }

  // 5. High theta decay relative to price — expensive carry
  const dailyDecayPct = price > 0 ? Math.abs(theta) / price : 0;
  if (dailyDecayPct > 0.03) {
    results.push({ reason: "HIGH_THETA_DECAY", delta: -20 });
  }

  // 6. Positive delta trend — call with delta > 0.4, favourable direction
  if (isCall && delta > 0.4 && delta <= 0.7) {
    results.push({ reason: "POSITIVE_DELTA_TREND", delta: 20 });
  }

  // 7. Negative delta trend — put with delta < -0.4
  if (!isCall && delta < -0.4 && delta >= -0.7) {
    results.push({ reason: "NEGATIVE_DELTA_TREND", delta: 20 });
  }

  // 8. Vol premium elevated — sigma well above typical 20% baseline
  if (sigma > 0.40) {
    results.push({ reason: "VOL_PREMIUM_ELEVATED", delta: -15 });
  }

  // 9. Vol discount — low implied vol, cheap options
  if (sigma < 0.15) {
    results.push({ reason: "VOL_DISCOUNT", delta: 15 });
  }

  // 10. Near expiry risk — < 7 days
  if (daysToExpiry < 7) {
    results.push({ reason: "NEAR_EXPIRY_RISK", delta: -20 });
  }

  // 11. Wide bid-ask proxy — very high vega relative to price suggests illiquidity
  const vegaRatio = price > 0 ? vega / price : 0;
  if (vegaRatio > 0.5) {
    results.push({ reason: "WIDE_BID_ASK_PROXY", delta: -10 });
  }

  // 12. Favourable risk/reward — delta 0.25-0.55, decent time value, not near expiry
  if (absDelta >= 0.25 && absDelta <= 0.55 && timeValue > price * 0.3 && daysToExpiry >= 14) {
    results.push({ reason: "FAVOURABLE_RISK_REWARD", delta: 25 });
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score an option candidate and produce a recommendation.
 */
export function scoreOption(
  optionType: OptionType,
  S: number,
  K: number,
  T: number,      // years to expiry
  r: number,
  sigma: number,
): Recommendation {
  const { price, greeks } = blackScholes(optionType, S, K, T, r, sigma);
  const rules = evaluateRules(optionType, S, K, T, sigma, price, greeks.delta, greeks.theta, greeks.vega);

  const rawScore = rules.reduce((acc, r) => acc + r.delta, 0);
  const score = Math.min(100, Math.max(-100, rawScore));

  return {
    optionType,
    strike: K,
    expirySecs: Math.round(T * 365 * 86400),
    price,
    score,
    signalStrength: scoreToStrength(score),
    reasons: rules.map((r) => r.reason),
    greeks,
    impliedVol: sigma,
  };
}

/**
 * Generate strike candidates around ATM.
 * Produces 5 strikes per side (±5, ±10, ±15, ±20, ±25 ticks) plus ATM.
 */
export function generateStrikes(S: number): number[] {
  // Tick size: 1 for stocks < $50, 5 for stocks < $200, 10 for > $200
  const tick = S < 50 ? 1 : S < 200 ? 5 : 10;
  const atm = Math.round(S / tick) * tick;
  const strikes = new Set<number>();
  for (let i = -5; i <= 5; i++) {
    const k = atm + i * tick;
    if (k > 0) strikes.add(k);
  }
  return Array.from(strikes).sort((a, b) => a - b);
}

/**
 * Standard expiry ladder in seconds.
 */
export const DEFAULT_EXPIRIES_SECS = [7, 14, 30, 60, 90].map((d) => d * 86400);
